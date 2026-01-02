#!/usr/bin/env tsx
/**
 * CLI tool to recompute all color tags for procreate files.
 *
 * This will:
 * 1. Find all color tag IDs (red, orange, yellow, green, blue, purple, pink, black, white, brown, gray, transparent)
 * 2. Remove all existing color tags from procreate files
 * 3. Queue all procreate files for color tag reprocessing
 * 4. Process the queue to extract and assign new color tags
 *
 * Usage:
 *   pnpm recompute-color-tags
 *   pnpm recompute-color-tags --dry-run
 */

import path from "node:path";
import fs from "node:fs";
import { db, runMigrations } from "../database.js";
import { THUMBNAIL_DIR, AUTO_COLOR_TAG_LIMIT, AUTO_COLOR_TAG_THRESHOLD } from "../config.js";
import { extractDominantColors, getColorTagNames } from "../color-extraction.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ProcreateFileRow {
  id: number;
  file_name: string;
  file_hash: string;
  thumbnail_path: string;
}

interface TagRow {
  id: number;
  name: string;
}

// -----------------------------------------------------------------------------
// Main Logic
// -----------------------------------------------------------------------------

async function recomputeColorTags(dryRun: boolean): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("RECOMPUTE COLOR TAGS");
  console.log("=".repeat(80));

  if (dryRun) {
    console.log("\n⚠️  DRY RUN MODE - No changes will be made\n");
  }

  // Step 1: Get all color tag names and their IDs
  const colorTagNames = getColorTagNames();
  console.log(`\n📋 Color tags to process: ${colorTagNames.join(", ")}`);

  const stmtGetTagsByNames = db.prepare(`
    SELECT id, name FROM tags WHERE name IN (${colorTagNames.map(() => "?").join(", ")})
  `);
  const colorTags = stmtGetTagsByNames.all(...colorTagNames) as TagRow[];
  const colorTagIds = colorTags.map((t) => t.id);

  console.log(`   Found ${colorTags.length} color tags in database`);

  if (colorTagIds.length === 0) {
    console.log("\n❌ No color tags found in database. Run migrations first.");
    return;
  }

  // Step 2: Count existing color tag associations
  const stmtCountExisting = db.prepare(`
    SELECT COUNT(*) as count FROM procreate_hash_tags 
    WHERE tag_id IN (${colorTagIds.map(() => "?").join(", ")})
  `);
  const existingCount = (stmtCountExisting.get(...colorTagIds) as { count: number }).count;
  console.log(`\n🗑️  Existing color tag associations to remove: ${existingCount}`);

  // Step 3: Remove all existing color tags
  if (!dryRun && existingCount > 0) {
    const stmtDeleteColorTags = db.prepare(`
      DELETE FROM procreate_hash_tags 
      WHERE tag_id IN (${colorTagIds.map(() => "?").join(", ")})
    `);
    const deleteResult = stmtDeleteColorTags.run(...colorTagIds);
    console.log(`   Removed ${deleteResult.changes} color tag associations`);
  }

  // Step 4: Get all procreate files
  const stmtGetAllFiles = db.prepare(`
    SELECT id, file_name, file_hash, thumbnail_path 
    FROM procreate_files 
    ORDER BY id
  `);
  const files = stmtGetAllFiles.all() as ProcreateFileRow[];
  console.log(`\n📁 Procreate files to process: ${files.length}`);

  if (files.length === 0) {
    console.log("\n✅ No files to process.");
    return;
  }

  // Step 5: Process each file
  const stmtGetTagByName = db.prepare("SELECT id FROM tags WHERE name = ?");
  const stmtUpsertHashTag = db.prepare(`
    INSERT OR IGNORE INTO procreate_hash_tags (file_hash, tag_id)
    VALUES (?, ?)
  `);

  const thresholdDecimal = AUTO_COLOR_TAG_THRESHOLD / 100;
  let processedCount = 0;
  let taggedCount = 0;
  let errorCount = 0;
  const tagStats = new Map<string, number>();

  console.log(`\n🎨 Processing files (limit=${AUTO_COLOR_TAG_LIMIT}, threshold=${AUTO_COLOR_TAG_THRESHOLD}%)...\n`);

  for (const file of files) {
    processedCount++;
    const thumbnailFullPath = path.join(THUMBNAIL_DIR, file.thumbnail_path);

    // Check if thumbnail exists
    if (!fs.existsSync(thumbnailFullPath)) {
      console.log(`   [SKIP] ${file.file_name} - thumbnail not found`);
      errorCount++;
      continue;
    }

    try {
      // Extract dominant colors
      const results = await extractDominantColors(thumbnailFullPath, AUTO_COLOR_TAG_LIMIT);
      const addedTags: string[] = [];

      for (const { colorTag, confidence } of results) {
        // Skip colors below threshold
        if (confidence < thresholdDecimal) {
          continue;
        }

        // Look up tag ID
        const tagRow = stmtGetTagByName.get(colorTag) as { id: number } | undefined;
        if (!tagRow) {
          continue;
        }

        if (!dryRun) {
          stmtUpsertHashTag.run(file.file_hash, tagRow.id);
        }

        addedTags.push(`${colorTag} (${(confidence * 100).toFixed(0)}%)`);
        tagStats.set(colorTag, (tagStats.get(colorTag) || 0) + 1);
      }

      if (addedTags.length > 0) {
        taggedCount++;
        const progress = `[${processedCount}/${files.length}]`;
        console.log(`   ${progress} ${file.file_name} → ${addedTags.join(", ")}`);
      }
    } catch (err) {
      console.log(`   [ERROR] ${file.file_name}: ${err instanceof Error ? err.message : String(err)}`);
      errorCount++;
    }
  }

  // Step 6: Print summary
  console.log("\n" + "-".repeat(80));
  console.log("SUMMARY");
  console.log("-".repeat(80));
  console.log(`\n   Files processed: ${processedCount}`);
  console.log(`   Files tagged: ${taggedCount}`);
  console.log(`   Errors/Skipped: ${errorCount}`);

  if (tagStats.size > 0) {
    console.log("\n   Tag distribution:");
    const sortedStats = Array.from(tagStats.entries()).sort((a, b) => b[1] - a[1]);
    for (const [tag, count] of sortedStats) {
      console.log(`     ${tag.padEnd(12)} ${count}`);
    }
  }

  if (dryRun) {
    console.log("\n⚠️  DRY RUN - No changes were made. Run without --dry-run to apply changes.");
  } else {
    console.log("\n✅ Color tags recomputed successfully!");
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
Usage: pnpm recompute-color-tags [options]

This command will:
  1. Remove all existing color tags from all procreate files
  2. Re-extract dominant colors from each file's thumbnail
  3. Re-assign color tags based on current extraction settings

Options:
  --dry-run    Show what would be done without making changes
  --help, -h   Show this help message

Environment variables that affect behavior:
  AUTO_COLOR_TAG_LIMIT      Number of color tags per file (default: 1, max: 5)
  AUTO_COLOR_TAG_THRESHOLD  Minimum confidence % to assign tag (default: 0)
`);
    process.exit(0);
  }

  const dryRun = args.includes("--dry-run");

  try {
    // Initialize database
    runMigrations();

    await recomputeColorTags(dryRun);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
