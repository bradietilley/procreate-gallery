import fs from "node:fs";
import path from "node:path";
import { PROCREATE_DIR } from "./config.js";
import { getAllTrackedPaths } from "./database.js";
import { enqueueFile } from "./queue.js";

// -----------------------------------------------------------------------------
// Filesystem Scanner
// -----------------------------------------------------------------------------

function scanDirectory(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...scanDirectory(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".procreate")) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`[SCAN] Error reading directory ${dir}:`, err);
  }

  return files;
}

function getRelativePath(absolutePath: string): string {
  return path.relative(PROCREATE_DIR, absolutePath);
}

// -----------------------------------------------------------------------------
// Initial Scan
// -----------------------------------------------------------------------------

export function performInitialScan() {
  console.log(`[SCAN] Scanning ${PROCREATE_DIR}...`);

  // Get all files from filesystem
  const filesOnDisk = scanDirectory(PROCREATE_DIR);
  const diskPaths = new Set(filesOnDisk.map(getRelativePath));

  console.log(`[SCAN] Found ${filesOnDisk.length} .procreate files on disk`);

  // Get all files from database
  const trackedPaths = getAllTrackedPaths();
  console.log(`[SCAN] Found ${trackedPaths.size} files in database`);

  // Find new files (on disk but not in DB)
  const newFiles: string[] = [];
  for (const file of filesOnDisk) {
    const relativePath = getRelativePath(file);
    if (!trackedPaths.has(relativePath)) {
      newFiles.push(file);
    }
  }

  // Find orphaned files (in DB but not on disk)
  const orphanedPaths: string[] = [];
  for (const trackedPath of trackedPaths) {
    if (!diskPaths.has(trackedPath)) {
      orphanedPaths.push(trackedPath);
    }
  }

  console.log(`[SCAN] ${newFiles.length} new files to import`);
  console.log(`[SCAN] ${orphanedPaths.length} orphaned entries in database`);

  // Queue new files for import (non-blocking)
  if (newFiles.length > 0) {
    console.log(`[SCAN] Queueing ${newFiles.length} files for import...`);
    setImmediate(() => {
      for (const file of newFiles) {
        enqueueFile(file);
      }
    });
  }

  // Log orphaned files (don't delete automatically - could be mounted volume issue)
  if (orphanedPaths.length > 0) {
    console.log(`[SCAN] Orphaned database entries (files no longer on disk):`);
    for (const orphan of orphanedPaths.slice(0, 10)) {
      console.log(`[SCAN]   - ${orphan}`);
    }
    if (orphanedPaths.length > 10) {
      console.log(`[SCAN]   ... and ${orphanedPaths.length - 10} more`);
    }
  }
}
