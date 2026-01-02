import { dbGet } from "@/lib/db";
import { resolveThumbnailPath } from "@/lib/config";
import { type NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { ProcreateFile } from "@/lib/types";

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const procreateId = Number.parseInt(params.id);

    if (Number.isNaN(procreateId)) {
      return NextResponse.json({ error: "Invalid procreate ID" }, { status: 400 });
    }

    const row = (await dbGet(
      `
      SELECT thumbnail_path
      FROM procreate_files
      WHERE id = ?
      `,
      [procreateId],
    )) as Pick<ProcreateFile, "thumbnail_path">;

    if (!row) {
      return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
    }

    const filepath = resolveThumbnailPath(row.thumbnail_path);
    const imageData = await fs.readFile(filepath);

    return new NextResponse(imageData, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error fetching thumbnail:", error);
    return NextResponse.json({ error: "Failed to fetch thumbnail" }, { status: 500 });
  }
}
