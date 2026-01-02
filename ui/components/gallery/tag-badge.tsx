"use client";

import Link from "next/link";
import type { Tag } from "@/lib/types";

function getContrastColor(hexColor: string): string {
  const r = Number.parseInt(hexColor.slice(1, 3), 16);
  const g = Number.parseInt(hexColor.slice(3, 5), 16);
  const b = Number.parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

interface TagBadgeProps {
  tag: Tag;
  size?: "sm" | "md";
  showRemove?: boolean;
  onRemove?: () => void;
  clickable?: boolean;
}

export default function TagBadge({ tag, size = "sm", showRemove = false, onRemove, clickable = true }: TagBadgeProps) {
  const sizeClasses = size === "sm" ? "px-1 py-0.5 text-xs" : "px-2 py-1 text-xs";
  const contrastColor = getContrastColor(tag.color);

  const badgeContent = (
    <>
      {tag.name}
      {showRemove && onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:opacity-70">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </>
  );

  const baseClasses = `inline-flex items-center gap-1 rounded font-medium ${sizeClasses}`;

  if (clickable) {
    return (
      <Link
        href={`/tags/${tag.id}`}
        onClick={(e) => e.stopPropagation()}
        className={`${baseClasses} hover:opacity-80 transition-opacity`}
        style={{
          backgroundColor: tag.color,
          color: contrastColor,
        }}>
        {badgeContent}
      </Link>
    );
  }

  return (
    <span
      className={baseClasses}
      style={{
        backgroundColor: tag.color,
        color: contrastColor,
      }}>
      {badgeContent}
    </span>
  );
}

export { getContrastColor };
