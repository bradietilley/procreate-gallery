import path from "node:path";
import fs from "node:fs";
import chokidar from "chokidar";
import { PROCREATE_DIR, THUMBNAIL_DIR } from "./config.js";
import { stmtDeleteSimilarities, stmtDeleteFile, stmtGetFileInfo } from "./database.js";
import { enqueueFile } from "./queue.js";

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

// -----------------------------------------------------------------------------
// File Handlers
// -----------------------------------------------------------------------------

function handleFileAdd(filePath: string) {
  if (!filePath.endsWith(".procreate")) return;
  if (path.basename(filePath).startsWith(".")) return;

  enqueueFile(filePath);
}

function handleFileChange(filePath: string) {
  if (!filePath.endsWith(".procreate")) return;
  if (path.basename(filePath).startsWith(".")) return;

  enqueueFile(filePath);
}

function handleFileDelete(filePath: string) {
  if (!filePath.endsWith(".procreate")) return;

  const fileRelativePath = getRelativePath(filePath, PROCREATE_DIR);
  console.log(`[DELETE] ${path.basename(filePath)}`);

  const row = stmtGetFileInfo.get(fileRelativePath) as { id: number; thumbnail_path: string } | undefined;

  if (!row) {
    console.log(`[DELETE] File not in database: ${path.basename(filePath)}`);
    return;
  }

  stmtDeleteSimilarities.run(row.id, row.id);
  stmtDeleteFile.run(fileRelativePath);
  console.log(`[DELETE] Removed from database: ${path.basename(filePath)}`);

  if (row.thumbnail_path) {
    const thumbPath = path.join(THUMBNAIL_DIR, row.thumbnail_path);
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
      console.log(`[DELETE] Removed thumbnail: ${row.thumbnail_path}`);
    }
  }
}

// -----------------------------------------------------------------------------
// Watcher
// -----------------------------------------------------------------------------

let watcher: chokidar.FSWatcher | null = null;

export function startWatcher() {
  watcher = chokidar.watch(PROCREATE_DIR, {
    persistent: true,
    ignoreInitial: true, // We handle initial scan ourselves in scan.ts
    awaitWriteFinish: {
      stabilityThreshold: 1500,
      pollInterval: 100,
    },
  });

  watcher
    .on("add", handleFileAdd)
    .on("change", handleFileChange)
    .on("unlink", handleFileDelete)
    .on("error", (error: Error) => console.error("[WATCHER ERROR]", error));

  console.log(`[WATCH] ${PROCREATE_DIR}`);

  return watcher;
}

export function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
