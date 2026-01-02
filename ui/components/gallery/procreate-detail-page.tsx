"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import type { ProcreateFile, Tag } from "@/lib/types";
import { formatDate } from "date-fns";
import ProcreateFilePreview from "./procreate-file-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import TagBadge, { getContrastColor } from "@/components/gallery/tag-badge";
import Thumbnail from "@/components/gallery/thumbnail";
import Link from "next/link";

type SimilarSortOption = "similarity-desc" | "similarity-asc" | "date-desc" | "date-asc" | "name-asc" | "name-desc";

interface SimilarImage extends ProcreateFile {
  procreate_id: number;
  similarity_score: number;
}

interface OverlayData {
  original: ProcreateFile & { tags: Tag[] };
  similar: SimilarImage[];
}

interface ProcreateDetailPageProps {
  procreateId: number;
}

function formatTimeSpent(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function ProcreateDetailPage({ procreateId }: ProcreateDetailPageProps) {
  const router = useRouter();
  const [data, setData] = useState<OverlayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState<Tag[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [similarSortBy, setSimilarSortBy] = useState<SimilarSortOption>("similarity-desc");
  const tagInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [similarResponse, tagsResponse, allTagsResponse] = await Promise.all([fetch(`/api/procreate/${procreateId}/similar`), fetch(`/api/procreate/${procreateId}/tags`), fetch(`/api/tags`)]);

      const similarData = await similarResponse.json();
      const tagsData = await tagsResponse.json();
      const allTags = await allTagsResponse.json();

      setData({
        original: { ...similarData.original, tags: tagsData.tags || [] },
        similar: similarData.similar,
      });
      setAvailableTags(allTags.tags || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, [procreateId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "t" || e.key === "T") {
        if (document.activeElement !== tagInputRef.current) {
          e.preventDefault();
          tagInputRef.current?.focus();
        }
      }

      if (document.activeElement !== tagInputRef.current) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          navigateToProcreate(procreateId - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          navigateToProcreate(procreateId + 1);
        }
      }

      if (e.key === "Backspace" && document.activeElement === tagInputRef.current && tagInput === "") {
        e.preventDefault();
        if (data?.original.tags && data.original.tags.length > 0) {
          removeTag(data.original.tags[data.original.tags.length - 1].name);
        }
      }

      if (document.activeElement === tagInputRef.current && filteredSuggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedSuggestionIndex((prev) => (prev + 1) % filteredSuggestions.length);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedSuggestionIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (filteredSuggestions.length > 0) {
            addTag(filteredSuggestions[selectedSuggestionIndex].name);
          } else if (tagInput.trim()) {
            addTag(tagInput.trim());
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [procreateId, tagInput, data, filteredSuggestions, selectedSuggestionIndex]);

  useEffect(() => {
    if (tagInput.trim()) {
      const filtered = availableTags
        .filter((tag) => tag.name.toLowerCase().startsWith(tagInput.toLowerCase()))
        .filter((tag) => !data?.original.tags.some((t) => t.name === tag.name))
        .slice(0, 5);
      setFilteredSuggestions(filtered);
      setSelectedSuggestionIndex(0);
    } else {
      setFilteredSuggestions([]);
    }
  }, [tagInput, availableTags, data?.original.tags]);

  const sortedSimilar = useMemo(() => {
    if (!data?.similar) return [];

    return [...data.similar].sort((a, b) => {
      switch (similarSortBy) {
        case "similarity-desc":
          return b.similarity_score - a.similarity_score;
        case "similarity-asc":
          return a.similarity_score - b.similarity_score;
        case "date-desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "date-asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name-asc":
          return a.file_name.localeCompare(b.file_name);
        case "name-desc":
          return b.file_name.localeCompare(a.file_name);
        default:
          return 0;
      }
    });
  }, [data?.similar, similarSortBy]);

  const navigateToProcreate = (newId: number) => {
    if (newId > 0) {
      router.push(`/procreate/${newId}`);
    }
  };

  const addTag = async (tagName: string) => {
    if (!tagName || data?.original.tags.some((t) => t.name === tagName)) return;

    try {
      const response = await fetch(`/api/procreate/${procreateId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tagName }),
      });

      if (response.ok) {
        const tagsResponse = await fetch(`/api/procreate/${procreateId}/tags`);
        const tagsData = await tagsResponse.json();

        setData((prev) =>
          prev
            ? {
                ...prev,
                original: { ...prev.original, tags: tagsData.tags || [] },
              }
            : null,
        );
        setTagInput("");

        if (!availableTags.some((t) => t.name === tagName)) {
          const allTagsResponse = await fetch(`/api/tags`);
          const allTags = await allTagsResponse.json();
          setAvailableTags(allTags.tags || []);
        }
      }
    } catch (error) {
      console.error("Failed to add tag:", error);
    }
  };

  const removeTag = async (tagName: string) => {
    try {
      const response = await fetch(`/api/procreate/${procreateId}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tagName }),
      });

      if (response.ok) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                original: { ...prev.original, tags: prev.original.tags.filter((t) => t.name !== tagName) },
              }
            : null,
        );
      }
    } catch (error) {
      console.error("Failed to remove tag:", error);
    }
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-4">
        {/* Navigation controls */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back to Gallery
          </Link>

          <div className="flex gap-2">
            <Button variant="outline" size="icon" asChild title="Download file">
              <a href={`/api/procreate/${procreateId}/download`} download>
                <Download className="w-4 h-4" />
              </a>
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigateToProcreate(procreateId - 1)} disabled={procreateId <= 1}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigateToProcreate(procreateId + 1)}>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6 sticky top-24">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">{data.original.file_name}</h1>
                <p className="text-xs text-slate-500 font-mono">{data.original.file_path}</p>
              </div>

              <Thumbnail src={`/api/procreate/${data.original.id}/thumbnail?h=${data.original.file_hash}`} alt={data.original.file_name} width={data.original.canvas_width} height={data.original.canvas_height} showBlurredBackground={false} className="rounded-lg" />

              {/* Canvas Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {data.original.file_created_at && (
                  <div>
                    <span className="text-slate-500">Created</span>
                    <p className="font-medium text-slate-900">{formatDate(new Date(data.original.file_created_at * 1000), "do MMM yyyy, h:mm a")}</p>
                  </div>
                )}

                {data.original.file_updated_at && (
                  <div>
                    <span className="text-slate-500">Updated</span>
                    <p className="font-medium text-slate-900">{formatDate(new Date(data.original.file_updated_at * 1000), "do MMM yyyy, h:mm a")}</p>
                  </div>
                )}

                {data.original.canvas_width && data.original.canvas_height && (
                  <div>
                    <span className="text-slate-500">Dimensions</span>
                    <p className="font-medium text-slate-900">
                      {data.original.canvas_width} × {data.original.canvas_height}
                    </p>
                  </div>
                )}
                {data.original.time_spent && data.original.time_spent > 0 && (
                  <div>
                    <span className="text-slate-500">Time Spent</span>
                    <p className="font-medium text-slate-900">{formatTimeSpent(data.original.time_spent)}</p>
                  </div>
                )}
                {data.original.layer_count && (
                  <div>
                    <span className="text-slate-500">Layers</span>
                    <p className="font-medium text-slate-900">{data.original.layer_count}</p>
                  </div>
                )}
                {data.original.dpi && (
                  <div>
                    <span className="text-slate-500">DPI</span>
                    <p className="font-medium text-slate-900">{data.original.dpi}</p>
                  </div>
                )}
                {data.original.file_size && (
                  <div>
                    <span className="text-slate-500">File Size</span>
                    <p className="font-medium text-slate-900">{formatFileSize(data.original.file_size)}</p>
                  </div>
                )}
                {data.original.color_profile && (
                  <div>
                    <span className="text-slate-500">Color Profile</span>
                    <p className="font-medium text-slate-900">{data.original.color_profile}</p>
                  </div>
                )}
                {data.original.procreate_version && (
                  <div>
                    <span className="text-slate-500">Procreate Version</span>
                    <p className="font-medium text-slate-900">{data.original.procreate_version}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2 mb-3">{data.original.tags.length === 0 ? <p className="text-sm text-slate-500">No tags yet. Press T to add tags.</p> : data.original.tags.map((tag) => <TagBadge key={tag.id} tag={tag} size="md" showRemove onRemove={() => removeTag(tag.name)} />)}</div>

                <div className="relative">
                  <Input
                    ref={tagInputRef}
                    type="text"
                    placeholder="Add tag... (Press T to focus)"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addTag(tagInput);
                      }
                    }}
                    className="w-full"
                  />

                  {filteredSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-20">
                      {filteredSuggestions.map((suggestion, index) => (
                        <button key={suggestion.id} onClick={() => addTag(suggestion.name)} className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 flex items-center gap-2 ${index === selectedSuggestionIndex ? "bg-slate-100" : ""}`}>
                          <span
                            className="px-2 py-0.5 rounded text-xs"
                            style={{
                              backgroundColor: suggestion.color,
                              color: getContrastColor(suggestion.color),
                            }}>
                            {suggestion.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">Press Enter to add • Backspace to remove last • ↑↓ to navigate suggestions</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Similar Artwork</h2>
              {data.similar && data.similar.length > 0 && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="similar-sort" className="text-sm font-medium text-slate-700">
                    Sort by
                  </Label>
                  <select id="similar-sort" value={similarSortBy} onChange={(e) => setSimilarSortBy(e.target.value as SimilarSortOption)} className="h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2">
                    <option value="similarity-desc">Similarity (High)</option>
                    <option value="similarity-asc">Similarity (Low)</option>
                    <option value="date-desc">Date (Newest)</option>
                    <option value="date-asc">Date (Oldest)</option>
                    <option value="name-asc">Name (A-Z)</option>
                    <option value="name-desc">Name (Z-A)</option>
                  </select>
                </div>
              )}
            </div>
            {!data.similar || data.similar.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
                <p className="text-slate-600">No similar artwork found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {sortedSimilar.map((image) => (
                  <ProcreateFilePreview key={`similar-${image.id}`} file={image} similarity={image.similarity_score} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
