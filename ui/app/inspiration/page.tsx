"use client";

import { useState, useEffect, Suspense } from "react";
import InspirationGallery from "@/components/gallery/inspiration-gallery";
import type { ProcreateFile } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";

function InspirationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tagId = searchParams.get("tag");
  const [files, setFiles] = useState<ProcreateFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFiles();
  }, [tagId]);

  const fetchFiles = async () => {
    try {
      const url = tagId ? `/api/procreate?tag=${tagId}` : "/api/procreate";
      const response = await fetch(url);
      const data = await response.json();

      if (Array.isArray(data)) {
        // Sort by created_at in descending order
        const sorted = [...data].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setFiles(sorted);
      }
    } catch (error) {
      console.error("Failed to fetch procreate files:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-lg text-white mb-2">Loading...</p>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-lg text-white mb-2">No Procreate files found</p>
        </div>
      </div>
    );
  }

  return <InspirationGallery files={files} onSelectProcreate={(id) => router.push(`/procreate/${id}`)} />;
}

export default function InspirationPage() {
  return (
    <main className="min-h-screen bg-black p-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <p className="text-lg text-white mb-2">Loading...</p>
            </div>
          </div>
        }>
        <InspirationContent />
      </Suspense>
    </main>
  );
}
