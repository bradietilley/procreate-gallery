"use client";

import type { ProcreateFile } from "@/lib/types";
import { formatBytes } from "@/lib/utils";
import { formatDate } from "date-fns";
import { DownloadCloudIcon } from "lucide-react";
import TagBadge from "@/components/gallery/tag-badge";
import Thumbnail from "@/components/gallery/thumbnail";

async function downloadProcreateFile(procreateId: number): Promise<void> {
  const res = await fetch(`/api/procreate/${procreateId}/download`, {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error(`Failed to download procreate file (${res.status})`);
  }

  const blob = await res.blob();

  const contentDisposition = res.headers.get("Content-Disposition");
  const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] ?? `procreate-${procreateId}.procreate`;

  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ProcreateFilePreview({ file, similarity }: { file: ProcreateFile; similarity?: number }) {
  return (
    <a href={`/procreate/${file.id}`} className="group relative overflow-hidden rounded-sm bg-white shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer">
      <Thumbnail src={`/api/procreate/${file.id}/thumbnail?h=${file.file_hash}`} alt={file.file_name} width={file.canvas_width} height={file.canvas_height} showBlurredBackground={true} />

      <div className="absolute inset-0 bg-black/60 p-3 transition-all duration-200 z-20 hidden flex-col items-center justify-between gap-2 group-hover:flex">
        <span className="flex flex-row items-center justify-end w-full">
          <button
            className="text-white cursor-pointer hover:bg-zinc-100/10 rounded-sm p-2"
            onClick={(e) => {
              console.log("prevent default", e);
              e.preventDefault();
              e.stopPropagation();
              downloadProcreateFile(file.id);

              return false;
            }}>
            <DownloadCloudIcon className="h-4 w-4" />
          </button>
        </span>
        <div className="flex-col items-center justify-end gap-2 text-shadow-accent w-full">
          <p className="text-white text-sm font-medium truncate text-center">{file.file_name}</p>
          {similarity && <p className="text-xs text-white/80 text-center">{Math.round(similarity * 100)}% similar</p>}

          <div className="w-full flex justify-between items-center">
            <p className="text-xs text-white/80 text-left">{formatDate(file.created_at, "do MMM yyyy, h:mm a")}</p>
            <p className="text-xs text-white/80 text-right">{formatBytes(file.file_size)}</p>
          </div>
        </div>
      </div>

      {file.tags && file.tags.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/50 via-black/10 to-transparent z-10">
          <div className="flex flex-wrap gap-1">
            {file.tags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} size="sm" />
            ))}
          </div>
        </div>
      )}
    </a>
  );
}
