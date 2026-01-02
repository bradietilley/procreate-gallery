import { dbAll } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";

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

interface TagRow {
  file_hash: string;
  tag_id: number;
  tag_name: string;
  tag_color: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get("tag");

    // Fetch all procreate files, deduplicating by file_hash (keeping most recent)
    // Optionally filter by tag ID
    let files: ProcreateFileRow[];

    if (tagId) {
      files = dbAll<ProcreateFileRow>(
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
          AND pf.id IN (
            SELECT MAX(id) FROM procreate_files GROUP BY file_hash
          )
        ORDER BY pf.created_at DESC
        `,
        [Number(tagId)]
      );
    } else {
      files = dbAll<ProcreateFileRow>(`
        SELECT 
          id, 
          file_name, 
          file_path, 
          file_hash, 
          file_size, 
          thumbnail_path,
          canvas_width,
          canvas_height,
          created_at, 
          updated_at
        FROM procreate_files
        WHERE id IN (
          SELECT MAX(id) FROM procreate_files GROUP BY file_hash
        )
        ORDER BY created_at DESC
      `);
    }

    // Fetch all tags associated with any file
    const tags = dbAll<TagRow>(`
      SELECT 
        pht.file_hash,
        t.id as tag_id,
        t.name as tag_name,
        t.color as tag_color
      FROM procreate_hash_tags pht
      INNER JOIN tags t ON pht.tag_id = t.id
    `);

    // Group tags by file_hash for efficient lookup
    const tagsByHash = new Map<string, Array<{ id: number; name: string; color: string }>>();
    for (const tag of tags) {
      const existing = tagsByHash.get(tag.file_hash) ?? [];
      existing.push({ id: tag.tag_id, name: tag.tag_name, color: tag.tag_color });
      tagsByHash.set(tag.file_hash, existing);
    }

    // Combine files with their tags
    const result = files.map((file) => ({
      ...file,
      tags: tagsByHash.get(file.file_hash) ?? [],
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching procreate files:", error);
    return NextResponse.json({ error: "Failed to fetch files" }, { status: 500 });
  }
}
