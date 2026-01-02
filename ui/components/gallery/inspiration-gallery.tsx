"use client";

import { useMemo } from "react";
import type { ProcreateFile } from "@/lib/types";
import Thumbnail from "@/components/gallery/thumbnail";

interface InspirationGalleryProps {
  files: ProcreateFile[];
  onSelectProcreate: (id: number) => void;
}

export default function InspirationGallery({ files, onSelectProcreate }: InspirationGalleryProps) {
  // Create columns with balanced heights using canvas dimensions from file metadata
  const columns = useMemo(() => {
    const numColumns = 5;
    const cols: ProcreateFile[][] = Array.from({ length: numColumns }, () => []);
    const colHeights: number[] = Array(numColumns).fill(0);

    files.forEach((file) => {
      const aspectRatio = file.canvas_width && file.canvas_height ? file.canvas_width / file.canvas_height : 1;
      const itemHeight = 300 / aspectRatio; // Base width of 300px divided by aspect ratio

      // Add to column with smallest height
      const shortestColIndex = colHeights.indexOf(Math.min(...colHeights));
      cols[shortestColIndex].push(file);
      colHeights[shortestColIndex] += itemHeight;
    });

    return cols;
  }, [files]);

  return (
    <div className="flex gap-4" style={{ height: "100%" }}>
      {columns.map((column, colIndex) => (
        <div key={`col-${colIndex}`} className="flex-1 flex flex-col gap-4">
          {column.map((file) => (
            <div key={`image-${file.id}`} className="cursor-pointer rounded-sm transition-opacity hover:opacity-90" onClick={() => onSelectProcreate(file.id)}>
              <Thumbnail src={`/api/procreate/${file.id}/thumbnail?h=${file.file_hash}`} alt={file.file_name} width={file.canvas_width} height={file.canvas_height} square={false} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 20vw" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
