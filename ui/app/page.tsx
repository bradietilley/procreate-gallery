"use client";

import { useState, useEffect, useMemo } from "react";
import ThumbnailGallery from "@/components/gallery/thumbnail-gallery";
import TagFilter from "@/components/gallery/tag-filter";
import type { ProcreateFile } from "@/lib/types";
import { formatBytes } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type SortOption = "date-desc" | "date-asc" | "name-asc" | "name-desc";

export default function Home() {
  const [files, setFiles] = useState<ProcreateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filenameFilter, setFilenameFilter] = useState("");
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await fetch("/api/procreate");
      const data = await response.json();

      if (Array.isArray(data)) {
        setFiles(data);
      }
    } catch (error) {
      console.error("Failed to fetch procreate files:", error);
    } finally {
      setLoading(false);
    }
  };

  const hashMap = useMemo(() => {
    const map = new Map<string, number>();
    files.forEach((file) => {
      map.set(file.file_hash, (map.get(file.file_hash) || 0) + 1);
    });
    return map;
  }, [files]);

  const filteredFiles = useMemo(() => {
    const filtered = files.filter((file) => {
      // Filter by filename
      if (filenameFilter && !file.file_name.toLowerCase().includes(filenameFilter.toLowerCase())) {
        return false;
      }

      // Filter by duplicates
      if (showDuplicatesOnly && (hashMap.get(file.file_hash) || 0) <= 1) {
        return false;
      }

      // Filter by tags using AND logic - file must have ALL selected tags
      if (selectedTags.length > 0) {
        const fileTags = file.tags?.map((t) => t.id) || [];
        const hasAllSelectedTags = selectedTags.every((tagId) => fileTags.includes(tagId));
        if (!hasAllSelectedTags) {
          return false;
        }
      }

      return true;
    });

    // Sort filtered files
    return filtered.sort((a, b) => {
      switch (sortBy) {
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
  }, [files, filenameFilter, showDuplicatesOnly, hashMap, selectedTags, sortBy]);

  const totalFilesize = filteredFiles.reduce((total, file) => total + file.file_size, 0);
  const duplicates = filteredFiles.reduce(
    (data, file) => {
      if (data.hashMap.has(file.file_hash)) {
        data.total += 1;
      }

      data.hashMap.set(file.file_hash, true);

      return data;
    },
    { total: 0, hashMap: new Map() },
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div>
        {/* Stats bar */}
        {filteredFiles && (
          <div className="text-muted-foreground text-sm flex flex-row items-center gap-4 mb-4">
            <span>{filteredFiles.length} files</span>
            <span>{formatBytes(totalFilesize)} total</span>
            <span>{duplicates.total} duplicate(s)</span>
          </div>
        )}

        <div className="mb-6 bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
              <div className="flex-1 w-full">
                <Label htmlFor="filename-filter" className="text-sm font-medium text-slate-700 mb-2 block">
                  Filter by filename
                </Label>
                <Input id="filename-filter" type="text" placeholder="Search filenames..." value={filenameFilter} onChange={(e) => setFilenameFilter(e.target.value)} className="w-full" />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sort-by" className="text-sm font-medium text-slate-700">
                  Sort by
                </Label>
                <select id="sort-by" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2">
                  <option value="date-desc">Date (Newest)</option>
                  <option value="date-asc">Date (Oldest)</option>
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox id="duplicates-only" checked={showDuplicatesOnly} onCheckedChange={(checked) => setShowDuplicatesOnly(checked === true)} />
                <Label htmlFor="duplicates-only" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Show duplicates only
                </Label>
              </div>
            </div>

            <TagFilter selectedTags={selectedTags} onTagsChange={setSelectedTags} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 bg-white rounded-lg border border-slate-200">
            <div className="text-center">
              <p className="text-lg text-slate-600 mb-2">Loading...</p>
              <p className="text-sm text-slate-500">Loading your Procreate files...</p>
            </div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex items-center justify-center py-16 bg-white rounded-lg border border-slate-200">
            <div className="text-center">
              <p className="text-lg text-slate-600 mb-2">{files.length === 0 ? "No Procreate files found" : "No files match your filters"}</p>
              <p className="text-sm text-slate-500">{files.length === 0 ? "Add .procreate files to source directory to get started" : "Try adjusting your filters to see more results"}</p>
            </div>
          </div>
        ) : (
          <ThumbnailGallery files={filteredFiles} />
        )}
      </div>
    </main>
  );
}
