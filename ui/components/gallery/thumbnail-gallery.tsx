"use client";

import { ProcreateFile } from "@/lib/types";
import { formatDate } from "date-fns";
import Image from "next/image";
import { useState } from "react";
import { Button } from "../ui/button";
import { DownloadCloudIcon } from "lucide-react";
import ProcreateFilePreview from "./procreate-file-preview";

interface ThumbnailGalleryProps {
  files: ProcreateFile[];
}

export default function ThumbnailGallery({ files }: ThumbnailGalleryProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {files.map((file) => (
        <ProcreateFilePreview key={`image-${file.id}`} file={file} />
      ))}
    </div>
  );
}
