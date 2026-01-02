#!/usr/bin/env tsx
/**
 * CLI tool to recompute all similarity scores between procreate files.
 *
 * This will:
 * 1. Clear all existing similarity records from image_similarities table
 * 2. Re-extract vectors for files missing vectors (optional)
 * 3. Recompute cosine similarity between all file pairs
 * 4. Store pairs that meet the similarity threshold
 *
 * Usage:
 *   pnpm recompute-similarities
 *   pnpm recompute-similarities --dry-run
 *   pnpm recompute-similarities --regenerate-vectors
 */

import path from "node:path";
import fs from "node:fs";
import { db, runMigrations } from "../database.js";
import { THUMBNAIL_DIR, SIMILARITY_THRESHOLD } from "../config.js";
import { extractVector } from "../python-procreate.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ProcreateFileRow {
  id: number;
  file_name: string;
  thumbnail_path: string;
  vector: string | null;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Main Logic
// -----------------------------------------------------------------------------

async function recomputeSimilarities(dryRun: boolean, regenerateVectors: boolean): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("RECOMPUTE SIMILARITIES");
  console.log("=".repeat(80));

  if (dryRun) {
    console.log("\n⚠️  DRY RUN MODE - No changes will be made\n");
  }

  console.log(`\n📋 Configuration:`);
  console.log(`   Similarity threshold: ${SIMILARITY_THRESHOLD}`);
  console.log(`   Regenerate vectors: ${regenerateVectors}`);

  // Step 1: Get all procreate files
  const stmtGetAllFiles = db.prepare(`
    SELECT id, file_name, thumbnail_path, vector 
    FROM procreate_files 
    ORDER BY id
  `);
  const files = stmtGetAllFiles.all() as ProcreateFileRow[];
  console.log(`\n📁 Procreate files found: ${files.length}`);

  if (files.length === 0) {
    console.log("\n✅ No files to process.");
    return;
  }

  // Step 2: Count existing similarities
  const stmtCountSimilarities = db.prepare("SELECT COUNT(*) as count FROM image_similarities");
  const existingCount = (stmtCountSimilarities.get() as { count: number }).count;
  console.log(`\n🗑️  Existing similarity records to remove: ${existingCount}`);

  // Step 3: Clear all existing similarities
  if (!dryRun && existingCount > 0) {
    const stmtClearSimilarities = db.prepare("DELETE FROM image_similarities");
    const deleteResult = stmtClearSimilarities.run();
    console.log(`   Removed ${deleteResult.changes} similarity records`);
  }

  // Step 4: Regenerate vectors if requested, or identify files missing vectors
  const stmtUpdateVector = db.prepare("UPDATE procreate_files SET vector = ? WHERE id = ?");
  const fileVectors = new Map<number, number[]>();
  let vectorsRegenerated = 0;
  let vectorsSkipped = 0;

  console.log(`\n🔢 Processing vectors...`);

  for (const file of files) {
    const thumbnailFullPath = path.join(THUMBNAIL_DIR, file.thumbnail_path);

    if (!fs.existsSync(thumbnailFullPath)) {
      console.log(`   [SKIP] ${file.file_name} - thumbnail not found`);
      vectorsSkipped++;
      continue;
    }

    if (regenerateVectors || !file.vector) {
      if (dryRun) {
        if (!file.vector) {
          console.log(`   [WOULD GENERATE] ${file.file_name} - missing vector`);
        } else {
          console.log(`   [WOULD REGENERATE] ${file.file_name}`);
        }
        vectorsRegenerated++;
        continue;
      }

      try {
        console.log(`   [VECTOR] ${file.file_name} (id=${file.id})`);
        const result = await extractVector(thumbnailFullPath);
        const vectorStr = JSON.stringify(result.vector);
        stmtUpdateVector.run(vectorStr, file.id);
        fileVectors.set(file.id, result.vector);
        vectorsRegenerated++;
      } catch (err) {
        console.log(`   [ERROR] ${file.file_name}: ${err instanceof Error ? err.message : String(err)}`);
        vectorsSkipped++;
      }
    } else {
      try {
        fileVectors.set(file.id, JSON.parse(file.vector) as number[]);
      } catch {
        console.log(`   [ERROR] ${file.file_name}: Invalid vector JSON`);
        vectorsSkipped++;
      }
    }
  }

  console.log(`\n   Vectors processed: ${fileVectors.size}`);
  if (regenerateVectors) {
    console.log(`   Vectors regenerated: ${vectorsRegenerated}`);
  }
  console.log(`   Files skipped: ${vectorsSkipped}`);

  if (dryRun) {
    // In dry run, we need to load existing vectors for comparison count
    for (const file of files) {
      if (file.vector && !fileVectors.has(file.id)) {
        try {
          fileVectors.set(file.id, JSON.parse(file.vector) as number[]);
        } catch {
          // Skip invalid vectors
        }
      }
    }
  }

  // Step 5: Compute similarities between all pairs
  const fileIds = Array.from(fileVectors.keys()).sort((a, b) => a - b);
  const totalPairs = (fileIds.length * (fileIds.length - 1)) / 2;
  console.log(`\n🔄 Computing similarities for ${totalPairs} pairs...`);

  const stmtInsertSimilarity = db.prepare(`
    INSERT INTO image_similarities (procreate_id_1, procreate_id_2, similarity_score)
    VALUES (?, ?, ?)
  `);

  let similarPairs = 0;
  let processedPairs = 0;
  const lastProgress = { value: 0 };

  for (let i = 0; i < fileIds.length; i++) {
    const id1 = fileIds[i];
    const vec1 = fileVectors.get(id1)!;

    for (let j = i + 1; j < fileIds.length; j++) {
      const id2 = fileIds[j];
      const vec2 = fileVectors.get(id2)!;

      const similarity = cosineSimilarity(vec1, vec2);
      processedPairs++;

      if (similarity >= SIMILARITY_THRESHOLD) {
        const [canonId1, canonId2] = canonicalPair(id1, id2);

        if (!dryRun) {
          stmtInsertSimilarity.run(canonId1, canonId2, similarity);
        }
        similarPairs++;
      }

      // Progress update every 10%
      const progress = Math.floor((processedPairs / totalPairs) * 10);
      if (progress > lastProgress.value) {
        lastProgress.value = progress;
        console.log(`   ${progress * 10}% complete (${processedPairs}/${totalPairs} pairs, ${similarPairs} similar)`);
      }
    }
  }

  // Step 6: Print summary
  console.log("\n" + "-".repeat(80));
  console.log("SUMMARY");
  console.log("-".repeat(80));
  console.log(`\n   Files with vectors: ${fileVectors.size}`);
  console.log(`   Total pairs compared: ${processedPairs}`);
  console.log(`   Similar pairs found: ${similarPairs}`);
  console.log(`   Similarity threshold: ${SIMILARITY_THRESHOLD}`);

  if (similarPairs > 0) {
    const avgSimilarPerFile = ((similarPairs * 2) / fileVectors.size).toFixed(1);
    console.log(`   Avg similar images per file: ${avgSimilarPerFile}`);
  }

  if (dryRun) {
    console.log("\n⚠️  DRY RUN - No changes were made. Run without --dry-run to apply changes.");
  } else {
    console.log("\n✅ Similarities recomputed successfully!");
  }

  console.log("\n" + "=".repeat(80) + "\n");
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: pnpm recompute-similarities [options]

This command will:
  1. Remove all existing similarity records
  2. Optionally regenerate vectors for all files
  3. Recompute cosine similarity between all file pairs
  4. Store pairs that meet the similarity threshold

Options:
  --dry-run              Show what would be done without making changes
  --regenerate-vectors   Re-extract vectors for all files (slower but ensures consistency)
  --help, -h             Show this help message

Environment variables that affect behavior:
  SIMILARITY_THRESHOLD   Minimum similarity score to store (default: 0.75)
`);
    process.exit(0);
  }

  const dryRun = args.includes("--dry-run");
  const regenerateVectors = args.includes("--regenerate-vectors");

  try {
    // Initialize database
    runMigrations();

    await recomputeSimilarities(dryRun, regenerateVectors);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();

