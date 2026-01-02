import { dbAll, dbGet } from "@/lib/db";
import { ProcreateFile } from "@/lib/types";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const procreateId = Number.parseInt(id, 10);

    if (Number.isNaN(procreateId)) {
      return NextResponse.json({ error: "Invalid procreate ID" }, { status: 400 });
    }

    // 1. Fetch original file with all metadata
    const original = await dbGet<ProcreateFile>(
      `
      SELECT id, file_name, file_path, file_hash, file_size, thumbnail_path,
             canvas_width, canvas_height, dpi, orientation,
             layer_count, time_spent, color_profile, procreate_version,
             file_created_at, file_updated_at, created_at, updated_at
      FROM procreate_files
      WHERE id = ?
      `,
      [procreateId],
    );

    if (!original) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 2. Fetch similarity relationships only
    const similarities = await dbAll<{
      procreate_id_1: number;
      procreate_id_2: number;
      similarity_score: number;
    }>(
      `
      SELECT procreate_id_1, procreate_id_2, similarity_score
      FROM image_similarities
      WHERE procreate_id_1 = ? OR procreate_id_2 = ?
      `,
      [procreateId, procreateId],
    );

    if (!similarities?.length) {
      return NextResponse.json({ original, similar: [] });
    }

    // 3. Determine related IDs and map scores
    const scoreById = new Map<number, number>();
    const relatedIds: number[] = [];

    for (const row of similarities) {
      const relatedId = row.procreate_id_1 === procreateId ? row.procreate_id_2 : row.procreate_id_1;

      relatedIds.push(relatedId);
      scoreById.set(relatedId, row.similarity_score);
    }

    // 4. Fetch related procreate files with all metadata
    const placeholders = relatedIds.map(() => "?").join(",");

    const relatedFiles = await dbAll<ProcreateFile>(
      `
      SELECT id, file_name, file_path, file_hash, file_size, thumbnail_path,
             canvas_width, canvas_height, dpi, orientation,
             layer_count, time_spent, color_profile, procreate_version,
             file_created_at, file_updated_at, created_at, updated_at
      FROM procreate_files
      WHERE id IN (${placeholders})
      `,
      relatedIds,
    );

    // 5. Merge similarity_score and sort
    const similar = (relatedFiles ?? [])
      .map((file) => ({
        ...file,
        similarity_score: scoreById.get(file.id) ?? 0,
      }))
      .sort((a, b) => b.similarity_score - a.similarity_score);

    return NextResponse.json({
      original,
      similar,
    });
  } catch (error) {
    console.error("Error fetching similar images:", error);
    return NextResponse.json({ error: "Failed to fetch similar images" }, { status: 500 });
  }
}
