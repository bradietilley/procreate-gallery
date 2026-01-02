import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { PROCREATE_DIR, THUMBNAIL_DIR, SIMILARITY_THRESHOLD, AUTO_COLOR_TAG, AUTO_COLOR_TAG_LIMIT, AUTO_COLOR_TAG_THRESHOLD } from "./config.js";
import { db, stmtUpsertFile, stmtGetIdByPath, stmtUpdateVector, stmtDeleteSimilarities, stmtGetAllVectors, stmtUpsertSimilarity, stmtGetTagByName, stmtUpsertHashTag, stmtCheckHashTag, stmtEnqueueItem, stmtClaimQueueItem, stmtCompleteQueueItem, stmtFailQueueItem, stmtGetPendingCount, stmtCleanupStaleItems } from "./database.js";
import { inspectProcreate, extractVector } from "./python-procreate.js";
import type { ProcreateMetadata } from "./procreate-metadata-type.js";
import { extractDominantColors } from "./color-extraction.js";

// -----------------------------------------------------------------------------
// Queue Types
// -----------------------------------------------------------------------------

type QueueType = "metadata" | "vector" | "color_tag";

interface MetadataPayload {
  filePath: string;
}

interface VectorPayload {
  fileId: number;
  thumbnailPath: string;
}

interface ColorTagPayload {
  fileHash: string;
  thumbnailPath: string;
}

interface ClaimedItem {
  id: number;
  payload: string;
}

// -----------------------------------------------------------------------------
// Process Identity (for locking)
// -----------------------------------------------------------------------------

const PROCESS_ID = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

// -----------------------------------------------------------------------------
// Queue Processing State
// -----------------------------------------------------------------------------

let metadataProcessing = false;
let vectorProcessing = false;
let colorTagProcessing = false;

// Polling interval for checking queue (ms)
const POLL_INTERVAL = 100;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getRelativePath(absolutePath: string, baseDir: string): string {
  try {
    return path.relative(baseDir, absolutePath);
  } catch {
    return path.basename(absolutePath);
  }
}

function canonicalPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

function cosineSimilarity(vec1: number[], vec2: number[]): number {
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dot += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

function saveThumbnail(sourcePath: string, fileHash: string): string {
  const filename = `${fileHash}.png`;
  const destPath = path.join(THUMBNAIL_DIR, filename);

  if (sourcePath && fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    try {
      fs.unlinkSync(sourcePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  return filename;
}

// -----------------------------------------------------------------------------
// Database Queue Operations
// -----------------------------------------------------------------------------

function enqueue(queueType: QueueType, payload: object): boolean {
  const payloadStr = JSON.stringify(payload);
  const result = stmtEnqueueItem.run(queueType, payloadStr);
  return result.changes > 0;
}

function claimNext(queueType: QueueType): ClaimedItem | null {
  const result = stmtClaimQueueItem.get(PROCESS_ID, queueType) as ClaimedItem | undefined;
  return result || null;
}

function markComplete(itemId: number): void {
  stmtCompleteQueueItem.run(itemId);
}

function markFailed(itemId: number, error: string): void {
  stmtFailQueueItem.run(error, itemId);
}

function getPendingCount(queueType: QueueType): number {
  const result = stmtGetPendingCount.get(queueType) as { count: number };
  return result.count;
}

function cleanupStaleItems(): void {
  const result = stmtCleanupStaleItems.run();
  if (result.changes > 0) {
    console.log(`[QUEUE] Recovered ${result.changes} stale item(s) back to pending`);
  }
}

// -----------------------------------------------------------------------------
// Metadata Queue Processor
// -----------------------------------------------------------------------------

async function processMetadataQueue() {
  if (metadataProcessing) return;

  metadataProcessing = true;

  try {
    // Cleanup any stale items from crashed processes
    cleanupStaleItems();

    while (true) {
      const item = claimNext("metadata");
      if (!item) break;

      try {
        const payload = JSON.parse(item.payload) as MetadataPayload;
        await processMetadata(payload.filePath);
        markComplete(item.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[ERROR] Metadata processing failed:`, err);
        markFailed(item.id, errorMsg);
      }
    }
  } finally {
    metadataProcessing = false;
  }

  // Check if more items arrived while processing
  if (getPendingCount("metadata") > 0) {
    setTimeout(() => processMetadataQueue(), POLL_INTERVAL);
  }
}

async function processMetadata(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] File no longer exists: ${path.basename(filePath)}`);
    return;
  }

  console.log(`[INGEST] ${path.basename(filePath)}`);
  const meta: ProcreateMetadata = await inspectProcreate(filePath);

  const fileStats = fs.statSync(filePath);
  const fileSize = fileStats.size;
  const fileRelativePath = getRelativePath(filePath, PROCREATE_DIR);

  const thumbnailRelativePath = meta.thumbnail_path ? saveThumbnail(meta.thumbnail_path, meta.file_hash) : `${meta.file_hash}.png`;

  stmtUpsertFile.run(path.basename(filePath), fileRelativePath, meta.file_hash, fileSize, thumbnailRelativePath, meta.canvas_width ?? null, meta.canvas_height ?? null, meta.dpi, meta.orientation, meta.layer_count, meta.time_spent, meta.color_profile ?? null, meta.procreate_version ?? null, meta.created_at, meta.updated_at);

  const row = stmtGetIdByPath.get(fileRelativePath) as { id: number } | undefined;
  if (!row) {
    console.error(`[ERROR] Failed to retrieve file ID for ${filePath}`);
    return;
  }

  const fileId = row.id;
  const thumbnailFullPath = path.join(THUMBNAIL_DIR, thumbnailRelativePath);

  console.log(`[META] ${path.basename(filePath)} → id=${fileId}, ${meta.canvas_width}x${meta.canvas_height}, ${meta.layer_count} layers`);

  // Enqueue vector processing
  enqueue("vector", { fileId, thumbnailPath: thumbnailFullPath } as VectorPayload);
  processVectorQueue();

  // Enqueue color tagging if enabled
  if (AUTO_COLOR_TAG) {
    enqueue("color_tag", { fileHash: meta.file_hash, thumbnailPath: thumbnailFullPath } as ColorTagPayload);
    processColorTagQueue();
  }
}

// -----------------------------------------------------------------------------
// Vector Queue Processor
// -----------------------------------------------------------------------------

async function processVectorQueue() {
  if (vectorProcessing) return;

  vectorProcessing = true;

  try {
    while (true) {
      const item = claimNext("vector");
      if (!item) break;

      try {
        const payload = JSON.parse(item.payload) as VectorPayload;
        await processVector(payload.fileId, payload.thumbnailPath);
        markComplete(item.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[ERROR] Vector processing failed:`, err);
        markFailed(item.id, errorMsg);
      }
    }
  } finally {
    vectorProcessing = false;
  }

  // Check if more items arrived while processing
  if (getPendingCount("vector") > 0) {
    setTimeout(() => processVectorQueue(), POLL_INTERVAL);
  }
}

async function processVector(fileId: number, thumbnailPath: string) {
  if (!fs.existsSync(thumbnailPath)) {
    console.log(`[SKIP] Thumbnail not found: ${thumbnailPath}`);
    return;
  }

  console.log(`[VECTOR] Processing id=${fileId}`);

  const result = await extractVector(thumbnailPath);
  const vector = result.vector;
  const vectorStr = JSON.stringify(vector);

  stmtUpdateVector.run(vectorStr, fileId);
  stmtDeleteSimilarities.run(fileId, fileId);

  const others = stmtGetAllVectors.all(fileId) as Array<{ id: number; vector: string }>;

  let similarCount = 0;
  for (const other of others) {
    const otherVector = JSON.parse(other.vector) as number[];
    const similarity = cosineSimilarity(vector, otherVector);

    if (similarity >= SIMILARITY_THRESHOLD) {
      const [id1, id2] = canonicalPair(fileId, other.id);
      stmtUpsertSimilarity.run(id1, id2, similarity);
      similarCount++;
    }
  }

  console.log(`[VECTOR] id=${fileId} complete, ${similarCount} similar images found`);
}

// -----------------------------------------------------------------------------
// Color Tag Queue Processor
// -----------------------------------------------------------------------------

async function processColorTagQueue() {
  if (colorTagProcessing) return;

  colorTagProcessing = true;

  try {
    while (true) {
      const item = claimNext("color_tag");
      if (!item) break;

      try {
        const payload = JSON.parse(item.payload) as ColorTagPayload;
        await processColorTag(payload.fileHash, payload.thumbnailPath);
        markComplete(item.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[ERROR] Color tagging failed:`, err);
        markFailed(item.id, errorMsg);
      }
    }
  } finally {
    colorTagProcessing = false;
  }

  // Check if more items arrived while processing
  if (getPendingCount("color_tag") > 0) {
    setTimeout(() => processColorTagQueue(), POLL_INTERVAL);
  }
}

async function processColorTag(fileHash: string, thumbnailPath: string) {
  if (!fs.existsSync(thumbnailPath)) {
    console.log(`[SKIP] Thumbnail not found for color tagging: ${thumbnailPath}`);
    return;
  }

  console.log(`[COLOR] Analyzing dominant colors for hash=${fileHash.slice(0, 8)}...`);

  const results = await extractDominantColors(thumbnailPath, AUTO_COLOR_TAG_LIMIT);
  const addedTags: string[] = [];

  const thresholdDecimal = AUTO_COLOR_TAG_THRESHOLD / 100;

  for (const { colorTag, confidence } of results) {
    // Skip colors below the threshold
    if (confidence < thresholdDecimal) {
      continue;
    }

    // Look up the tag ID
    const tagRow = stmtGetTagByName.get(colorTag) as { id: number } | undefined;
    if (!tagRow) {
      console.log(`[COLOR] Tag "${colorTag}" not found in database, skipping`);
      continue;
    }

    // Check if this hash already has this color tag (don't overwrite user choices)
    const existingTag = stmtCheckHashTag.get(fileHash, tagRow.id);
    if (existingTag) {
      continue;
    }

    // Add the color tag
    stmtUpsertHashTag.run(fileHash, tagRow.id);
    addedTags.push(`${colorTag} (${(confidence * 100).toFixed(0)}%)`);
  }

  if (addedTags.length > 0) {
    console.log(`[COLOR] hash=${fileHash.slice(0, 8)} → ${addedTags.join(", ")}`);
  }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Enqueue a file for processing. Safe to call multiple times - duplicates are ignored.
 */
export function enqueueFile(filePath: string) {
  const added = enqueue("metadata", { filePath } as MetadataPayload);
  if (added) {
    console.log(`[QUEUE] Added ${path.basename(filePath)} to processing queue`);
  }
  // Always try to process in case the queue processor isn't running
  processMetadataQueue();
}

/**
 * Resume processing any pending items from the database.
 * Call this on startup to continue processing after a restart.
 */
export function resumeProcessing() {
  console.log(`[QUEUE] Process ${PROCESS_ID} checking for pending items...`);

  // Cleanup any stale items from crashed processes
  cleanupStaleItems();

  const metadataCount = getPendingCount("metadata");
  const vectorCount = getPendingCount("vector");
  const colorTagCount = getPendingCount("color_tag");

  if (metadataCount > 0 || vectorCount > 0 || colorTagCount > 0) {
    console.log(`[QUEUE] Resuming: ${metadataCount} metadata, ${vectorCount} vector, ${colorTagCount} color_tag items pending`);

    if (metadataCount > 0) processMetadataQueue();
    if (vectorCount > 0) processVectorQueue();
    if (colorTagCount > 0) processColorTagQueue();
  } else {
    console.log(`[QUEUE] No pending items to resume`);
  }
}

/**
 * Get queue statistics
 */
export function getQueueStats(): { metadata: number; vector: number; colorTag: number } {
  return {
    metadata: getPendingCount("metadata"),
    vector: getPendingCount("vector"),
    colorTag: getPendingCount("color_tag"),
  };
}
