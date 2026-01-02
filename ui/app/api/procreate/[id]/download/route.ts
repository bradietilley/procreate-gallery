import { dbGet } from "@/lib/db";
import { resolveProcreateFilePath } from "@/lib/config";
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
      SELECT *
      FROM procreate_files
      WHERE id = ?
      `,
      [procreateId],
    )) as ProcreateFile;

    if (!row) {
      return NextResponse.json({ error: "Procreate file not found" }, { status: 404 });
    }

    const filepath = resolveProcreateFilePath(row.file_path);
    const fileData = await fs.readFile(filepath);

    return new NextResponse(fileData, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${row.file_name}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error fetching procreate file:", error);
    return NextResponse.json({ error: "Failed to fetch procreate file" }, { status: 500 });
  }
}
