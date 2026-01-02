"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import type { Tag } from "@/lib/types";
import { Label } from "@/components/ui/label";

interface TagFilterProps {
  selectedTags: number[];
  onTagsChange: (tagIds: number[]) => void;
}

export default function TagFilter({ selectedTags, onTagsChange }: TagFilterProps) {
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const response = await fetch("/api/tags");
      const data = await response.json();
      setAvailableTags(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (tagId: number) => {
    if (selectedTags.includes(tagId)) {
      onTagsChange(selectedTags.filter((id) => id !== tagId));
    } else {
      onTagsChange([...selectedTags, tagId]);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium text-slate-700">Filter by tags (AND match)</Label>
      <div className="flex flex-wrap gap-2">
        {availableTags.map((tag) => (
          <button key={tag.id} onClick={() => toggleTag(tag.id)} className={`transition-opacity ${selectedTags.includes(tag.id) ? "opacity-100" : "opacity-50 hover:opacity-75"}`}>
            <Badge
              style={{
                backgroundColor: tag.color,
                color: isLightColor(tag.color) ? "#000000" : "#ffffff",
              }}
              className="cursor-pointer px-2 py-1 text-xs">
              {tag.name}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

function isLightColor(color: string): boolean {
  const hex = color.replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}
