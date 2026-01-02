import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: bigint | number | string | null, decimals = 2): string {
  if (!bytes || bytes === "0") return "0 Bytes";

  const k = BigInt(1024);
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let b = typeof bytes === "bigint" ? bytes : typeof bytes === "string" ? BigInt(bytes) : BigInt(Math.floor(bytes as number));

  let i = 0;

  while (b >= k && i < sizes.length - 1) {
    b = b / k;
    i++;
  }

  const divisor = k ** BigInt(i);
  const exactValue = typeof bytes === "string" ? Number(BigInt(bytes)) / Number(divisor) : Number(bytes) / Math.pow(1024, i);

  if (i === 0) {
    decimals = 0;
  }

  return `${exactValue.toFixed(decimals)} ${sizes[i]}`;
}
