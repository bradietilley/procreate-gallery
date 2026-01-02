import { NextResponse } from "next/server";
import { dbAll, dbRun, dbGet } from "@/lib/db";

// Helper to get file_hash from procreate file id
function getFileHash(procreateId: number): string | null {
  const file = dbGet<{ file_hash: string }>("SELECT file_hash FROM procreate_files WHERE id = ?", [procreateId]);
  return file?.file_hash ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const procreateId = Number.parseInt(id, 10);

    const fileHash = getFileHash(procreateId);
    if (!fileHash) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const tags = dbAll<{ id: number; name: string; color: string }>(
      `SELECT t.id, t.name, t.color
       FROM tags t
       INNER JOIN procreate_hash_tags pht ON t.id = pht.tag_id
       WHERE pht.file_hash = ?
       ORDER BY t.name`,
      [fileHash],
    );

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const procreateId = Number.parseInt(id, 10);
    const { tag } = await request.json();

    if (!tag || typeof tag !== "string") {
      return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
    }

    const fileHash = getFileHash(procreateId);
    if (!fileHash) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Insert or get tag id
    const existingTag = dbGet<{ id: number }>("SELECT id FROM tags WHERE name = ?", [tag]);

    let tagId: number;
    if (existingTag) {
      tagId = existingTag.id;
    } else {
      const result = dbRun("INSERT INTO tags (name, color) VALUES (?, ?)", [tag, "#94a3b8"]);
      tagId = result.lastInsertRowid as number;
    }

    // Link tag to file_hash (applies to all files with same hash)
    dbRun("INSERT OR IGNORE INTO procreate_hash_tags (file_hash, tag_id) VALUES (?, ?)", [fileHash, tagId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding tag:", error);
    return NextResponse.json({ error: "Failed to add tag" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const procreateId = Number.parseInt(id, 10);
    const { tag } = await request.json();

    if (!tag || typeof tag !== "string") {
      return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
    }

    const fileHash = getFileHash(procreateId);
    if (!fileHash) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Get tag id
    const existingTag = dbGet<{ id: number }>("SELECT id FROM tags WHERE name = ?", [tag]);

    if (existingTag) {
      dbRun("DELETE FROM procreate_hash_tags WHERE file_hash = ? AND tag_id = ?", [fileHash, existingTag.id]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing tag:", error);
    return NextResponse.json({ error: "Failed to remove tag" }, { status: 500 });
  }
}
