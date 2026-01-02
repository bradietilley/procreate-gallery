"use client";

import { useCallback, useEffect, useState, use } from "react";
import { Check, Pencil, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tag, ProcreateFile } from "@/lib/types";
import ProcreateFilePreview from "@/components/gallery/procreate-file-preview";
import { getContrastColor } from "@/components/gallery/tag-badge";

interface TagDetailData {
  tag: Tag;
  files: ProcreateFile[];
}

export default function TagDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tagId = Number.parseInt(id, 10);

  const [data, setData] = useState<TagDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editing states
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedColor, setEditedColor] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/tags/${tagId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError("Tag not found");
        } else {
          setError("Failed to load tag");
        }
        return;
      }

      const result = await response.json();
      setData(result);
      setEditedName(result.tag.name);
      setEditedColor(result.tag.color);
    } catch (err) {
      console.error("Failed to fetch tag:", err);
      setError("Failed to load tag");
    } finally {
      setLoading(false);
    }
  }, [tagId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === data?.tag.name) {
      setIsEditingName(false);
      setEditedName(data?.tag.name || "");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editedName.trim() }),
      });

      if (response.ok) {
        const result = await response.json();
        setData((prev) => (prev ? { ...prev, tag: result.tag } : null));
        setIsEditingName(false);
      } else {
        const errorData = await response.json();
        alert(errorData.error || "Failed to update tag name");
      }
    } catch (err) {
      console.error("Failed to update tag name:", err);
      alert("Failed to update tag name");
    } finally {
      setIsSaving(false);
    }
  };

  const handleColorChange = async (newColor: string) => {
    setEditedColor(newColor);

    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: newColor }),
      });

      if (response.ok) {
        const result = await response.json();
        setData((prev) => (prev ? { ...prev, tag: result.tag } : null));
      }
    } catch (err) {
      console.error("Failed to update tag color:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <p className="text-slate-600">Loading tag...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-600">{error || "Tag not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Tag Info Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6 sticky top-24">
              {/* Tag Preview */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className="px-4 py-2 rounded-lg text-lg font-semibold"
                  style={{
                    backgroundColor: editedColor,
                    color: getContrastColor(editedColor),
                  }}>
                  {data.tag.name}
                </div>
              </div>

              {/* Tag Name */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Tag Name</label>
                {isEditingName ? (
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveName();
                        if (e.key === "Escape") {
                          setIsEditingName(false);
                          setEditedName(data.tag.name);
                        }
                      }}
                      className="flex-1"
                      autoFocus
                      disabled={isSaving}
                    />
                    <Button size="icon" variant="ghost" onClick={handleSaveName} disabled={isSaving}>
                      <Check className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setIsEditingName(false);
                        setEditedName(data.tag.name);
                      }}
                      disabled={isSaving}>
                      <X className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-900 font-medium flex-1">{data.tag.name}</span>
                    <Button size="icon" variant="ghost" onClick={() => setIsEditingName(true)}>
                      <Pencil className="w-4 h-4 text-slate-500" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Tag Color */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Tag Color</label>
                <div className="flex items-center gap-3">
                  <Input type="color" value={editedColor} onChange={(e) => handleColorChange(e.target.value)} className="w-16 h-10 cursor-pointer p-1" />
                  <span className="text-sm text-slate-600 font-mono">{editedColor.toUpperCase()}</span>
                </div>
              </div>

              {/* Stats */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    <span className="font-semibold text-slate-900">{data.files.length}</span> {data.files.length === 1 ? "artwork" : "artworks"} tagged
                  </div>
                  {data.files.length > 0 && (
                    <Link href={`/inspiration?tag=${tagId}`}>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Inspire
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Artworks Grid */}
          <div className="lg:col-span-3">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Artworks with this tag</h2>
            {data.files.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
                <p className="text-slate-600">No artworks have been tagged with this tag yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {data.files.map((file) => (
                  <ProcreateFilePreview key={file.id} file={file} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
