"use client";

import { useEffect, useState } from "react";
import type { Tag } from "@/lib/types";
import Link from "next/link";

interface TagWithCount extends Tag {
  file_count: number;
}

export default function TagsPage() {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const response = await fetch("/api/tags");
      const data = await response.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    } finally {
      setLoading(false);
    }
  };

  const getContrastColor = (hexColor: string) => {
    const r = Number.parseInt(hexColor.slice(1, 3), 16);
    const g = Number.parseInt(hexColor.slice(3, 5), 16);
    const b = Number.parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? "#000000" : "#ffffff";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <p className="text-slate-600">Loading tags...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">All Tags</h2>
            <p className="text-sm text-slate-600 mt-1">Click on a tag to view and edit it.</p>
          </div>

          <div className="divide-y divide-slate-200">
            {tags.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-600">No tags yet. Add tags to your artwork to see them here.</p>
              </div>
            ) : (
              tags.map((tag) => (
                <Link key={tag.id} href={`/tags/${tag.id}`} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors block">
                  <div className="flex items-center gap-4">
                    <div
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{
                        backgroundColor: tag.color,
                        color: getContrastColor(tag.color),
                      }}>
                      {tag.name}
                    </div>
                  </div>

                  <span className="text-sm text-slate-500">
                    {tag.file_count} {tag.file_count === 1 ? "file" : "files"}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
