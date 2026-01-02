import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { DB_PATH, MIGRATIONS_DIR } from "./config.js";

// -----------------------------------------------------------------------------
// Database Setup
// -----------------------------------------------------------------------------

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");

// -----------------------------------------------------------------------------
// Migrations
// -----------------------------------------------------------------------------

export function runMigrations() {
  // Create migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const rows = db.prepare("SELECT name FROM migrations").all() as Array<{ name: string }>;
  const applied = new Set(rows.map((r) => r.name));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (!applied.has(file)) {
      console.log(`[MIGRATION] Applying ${file}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      db.exec(sql);
      db.prepare("INSERT INTO migrations (name) VALUES (?)").run(file);
    }
  }

  // Initialize prepared statements after migrations
  initStatements();
}

// -----------------------------------------------------------------------------
// Prepared Statements (initialized after migrations)
// -----------------------------------------------------------------------------

export let stmtUpsertFile: StatementSync;
export let stmtGetIdByPath: StatementSync;
export let stmtGetFileByHash: StatementSync;
export let stmtUpdateVector: StatementSync;
export let stmtDeleteSimilarities: StatementSync;
export let stmtGetAllVectors: StatementSync;
export let stmtUpsertSimilarity: StatementSync;
export let stmtDeleteFile: StatementSync;
export let stmtGetFileInfo: StatementSync;
export let stmtGetAllFilePaths: StatementSync;
export let stmtGetTagByName: StatementSync;
export let stmtUpsertHashTag: StatementSync;
export let stmtCheckHashTag: StatementSync;

// Queue-related statements
export let stmtEnqueueItem: StatementSync;
export let stmtClaimQueueItem: StatementSync;
export let stmtCompleteQueueItem: StatementSync;
export let stmtFailQueueItem: StatementSync;
export let stmtGetPendingCount: StatementSync;
export let stmtCleanupStaleItems: StatementSync;
export let stmtCheckDuplicateQueue: StatementSync;

function initStatements() {
  stmtUpsertFile = db.prepare(`
    INSERT INTO procreate_files (
      file_name, file_path, file_hash, file_size, thumbnail_path,
      canvas_width, canvas_height, dpi, orientation,
      layer_count, time_spent, color_profile, procreate_version,
      file_created_at, file_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      file_name = excluded.file_name,
      file_hash = excluded.file_hash,
      file_size = excluded.file_size,
      thumbnail_path = excluded.thumbnail_path,
      canvas_width = excluded.canvas_width,
      canvas_height = excluded.canvas_height,
      dpi = excluded.dpi,
      orientation = excluded.orientation,
      layer_count = excluded.layer_count,
      time_spent = excluded.time_spent,
      color_profile = excluded.color_profile,
      procreate_version = excluded.procreate_version,
      file_created_at = excluded.file_created_at,
      file_updated_at = excluded.file_updated_at,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmtGetIdByPath = db.prepare("SELECT id FROM procreate_files WHERE file_path = ?");
  stmtGetFileByHash = db.prepare("SELECT id FROM procreate_files WHERE file_hash = ?");
  stmtUpdateVector = db.prepare("UPDATE procreate_files SET vector = ? WHERE id = ?");
  stmtDeleteSimilarities = db.prepare("DELETE FROM image_similarities WHERE procreate_id_1 = ? OR procreate_id_2 = ?");
  stmtGetAllVectors = db.prepare("SELECT id, vector FROM procreate_files WHERE id != ? AND vector IS NOT NULL");
  stmtUpsertSimilarity = db.prepare(`
    INSERT INTO image_similarities (procreate_id_1, procreate_id_2, similarity_score)
    VALUES (?, ?, ?)
    ON CONFLICT(procreate_id_1, procreate_id_2)
    DO UPDATE SET similarity_score = MAX(similarity_score, excluded.similarity_score)
  `);
  stmtDeleteFile = db.prepare("DELETE FROM procreate_files WHERE file_path = ?");
  stmtGetFileInfo = db.prepare("SELECT id, thumbnail_path FROM procreate_files WHERE file_path = ?");
  stmtGetAllFilePaths = db.prepare("SELECT file_path FROM procreate_files");

  // Tag-related statements
  stmtGetTagByName = db.prepare("SELECT id FROM tags WHERE name = ?");
  stmtUpsertHashTag = db.prepare(`
    INSERT OR IGNORE INTO procreate_hash_tags (file_hash, tag_id)
    VALUES (?, ?)
  `);
  stmtCheckHashTag = db.prepare(`
    SELECT 1 FROM procreate_hash_tags WHERE file_hash = ? AND tag_id = ?
  `);

  // Queue-related statements
  // Insert a new queue item (will fail silently if duplicate pending/processing exists)
  stmtEnqueueItem = db.prepare(`
    INSERT OR IGNORE INTO processing_queue (queue_type, payload, status)
    VALUES (?, ?, 'pending')
  `);

  // Check if an item is already queued (pending or processing)
  stmtCheckDuplicateQueue = db.prepare(`
    SELECT id FROM processing_queue 
    WHERE queue_type = ? AND payload = ? AND status IN ('pending', 'processing')
  `);

  // Claim the next pending item for processing (atomic lock)
  // Uses a subquery to find and lock in one operation
  stmtClaimQueueItem = db.prepare(`
    UPDATE processing_queue 
    SET status = 'processing', 
        locked_at = CURRENT_TIMESTAMP, 
        locked_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = (
      SELECT id FROM processing_queue 
      WHERE queue_type = ? AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
    )
    RETURNING id, payload
  `);

  // Mark item as completed
  stmtCompleteQueueItem = db.prepare(`
    UPDATE processing_queue 
    SET status = 'completed', 
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  // Mark item as failed with error message
  stmtFailQueueItem = db.prepare(`
    UPDATE processing_queue 
    SET status = 'failed', 
        error_message = ?,
        retry_count = retry_count + 1,
        locked_at = NULL,
        locked_by = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  // Get count of pending items for a queue type
  stmtGetPendingCount = db.prepare(`
    SELECT COUNT(*) as count FROM processing_queue 
    WHERE queue_type = ? AND status = 'pending'
  `);

  // Cleanup stale processing items (locked for too long - likely crashed process)
  // Reset items locked for more than 5 minutes back to pending
  stmtCleanupStaleItems = db.prepare(`
    UPDATE processing_queue 
    SET status = 'pending', 
        locked_at = NULL, 
        locked_by = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'processing' 
      AND locked_at < datetime('now', '-5 minutes')
  `);
}

// -----------------------------------------------------------------------------
// Query Helpers
// -----------------------------------------------------------------------------

export function getAllTrackedPaths(): Set<string> {
  const rows = stmtGetAllFilePaths.all() as Array<{ file_path: string }>;
  return new Set(rows.map((r) => r.file_path));
}
