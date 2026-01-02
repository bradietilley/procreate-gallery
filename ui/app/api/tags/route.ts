import { NextResponse } from "next/server";
import { dbAll } from "@/lib/db";

export async function GET() {
  try {
    const tags = dbAll<{ id: number; name: string; color: string; file_count: number }>(
      `SELECT t.id, t.name, t.color, COUNT(pht.file_hash) as file_count
       FROM tags t
       LEFT JOIN procreate_hash_tags pht ON t.id = pht.tag_id
       GROUP BY t.id
       ORDER BY t.name`,
    );

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("Error fetching all tags:", error);
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}
