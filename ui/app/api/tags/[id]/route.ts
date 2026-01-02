import { NextResponse } from "next/server";
import { dbRun, dbGet, dbAll } from "@/lib/db";

interface TagRow {
  id: number;
  name: string;
  color: string;
}

interface ProcreateFileRow {
  id: number;
  file_name: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  thumbnail_path: string;
  canvas_width: number | null;
  canvas_height: number | null;
  created_at: string;
  updated_at: string;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tagId = Number.parseInt(id, 10);

    // Fetch the tag
    const tag = dbGet<TagRow>("SELECT id, name, color FROM tags WHERE id = ?", [tagId]);

    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    // Fetch all procreate files that have this tag
    const files = dbAll<ProcreateFileRow>(
      `
      SELECT 
        pf.id, 
        pf.file_name, 
        pf.file_path, 
        pf.file_hash, 
        pf.file_size, 
        pf.thumbnail_path,
        pf.canvas_width,
        pf.canvas_height,
        pf.created_at, 
        pf.updated_at
      FROM procreate_files pf
      INNER JOIN procreate_hash_tags pht ON pf.file_hash = pht.file_hash
      WHERE pht.tag_id = ?
      ORDER BY pf.created_at DESC
    `,
      [tagId],
    );

    return NextResponse.json({ tag, files });
  } catch (error) {
    console.error("Error fetching tag:", error);
    return NextResponse.json({ error: "Failed to fetch tag" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tagId = Number.parseInt(id, 10);
    const body = await request.json();
    const { color, name } = body;

    // Build update query dynamically based on what's provided
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (color && typeof color === "string") {
      updates.push("color = ?");
      values.push(color);
    }

    if (name && typeof name === "string") {
      // Check if a tag with this name already exists (excluding current tag)
      const existing = dbGet<TagRow>("SELECT id FROM tags WHERE name = ? AND id != ?", [name, tagId]);
      if (existing) {
        return NextResponse.json({ error: "A tag with this name already exists" }, { status: 400 });
      }
      updates.push("name = ?");
      values.push(name);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    values.push(tagId);
    dbRun(`UPDATE tags SET ${updates.join(", ")} WHERE id = ?`, values);

    // Fetch and return the updated tag
    const updatedTag = dbGet<TagRow>("SELECT id, name, color FROM tags WHERE id = ?", [tagId]);

    return NextResponse.json({ success: true, tag: updatedTag });
  } catch (error) {
    console.error("Error updating tag:", error);
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
  }
}
