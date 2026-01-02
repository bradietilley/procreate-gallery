import { NextResponse } from "next/server";
import { dbRun, dbGet } from "@/lib/db";

export async function POST() {
  try {
    // Get count before deletion for reporting
    const before = dbGet<{ count: number }>("SELECT COUNT(*) as count FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM procreate_hash_tags)");
    const orphanedCount = before?.count ?? 0;

    if (orphanedCount === 0) {
      return NextResponse.json({
        success: true,
        message: "No orphaned tags found",
        deleted: 0,
      });
    }

    // Delete orphaned tags
    dbRun(`
      DELETE FROM tags
      WHERE id NOT IN (SELECT DISTINCT tag_id FROM procreate_hash_tags)
    `);

    return NextResponse.json({
      success: true,
      message: `Removed ${orphanedCount} orphaned tag(s)`,
      deleted: orphanedCount,
    });
  } catch (error) {
    console.error("Error purging orphaned tags:", error);
    return NextResponse.json({ error: "Failed to purge orphaned tags" }, { status: 500 });
  }
}

// Also support GET to check how many orphaned tags exist without deleting
export async function GET() {
  try {
    const result = dbGet<{ count: number }>("SELECT COUNT(*) as count FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM procreate_hash_tags)");

    return NextResponse.json({
      orphanedCount: result?.count ?? 0,
    });
  } catch (error) {
    console.error("Error counting orphaned tags:", error);
    return NextResponse.json({ error: "Failed to count orphaned tags" }, { status: 500 });
  }
}
