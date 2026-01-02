#!/usr/bin/env tsx
/**
 * CLI tool to analyze colors in an image for debugging color extraction.
 *
 * Usage:
 *   pnpm analyze-colors <image-path> [--limit=N] [--verbose]
 *
 * Examples:
 *   pnpm analyze-colors ./test.png
 *   pnpm analyze-colors ./test.png --limit=10
 *   pnpm analyze-colors ./test.png --verbose
 */

import sharp from "sharp";
import path from "path";
import { extractDominantColors, findClosestColorTag, rgbToHsl, type DominantColorResult } from "../color-extraction.js";

// -----------------------------------------------------------------------------
// Color Analysis Types
// -----------------------------------------------------------------------------

interface ColorBucket {
  quantizedKey: string;
  avgRgb: [number, number, number];
  count: number;
  percentage: number;
  tag: string;
}

interface AnalysisResult {
  imagePath: string;
  dimensions: { width: number; height: number };
  totalPixels: number;
  opaquePixels: number;
  transparentPixels: number;
  transparencyPercentage: number;
  colorBuckets: ColorBucket[];
  tagSummary: Map<string, { count: number; percentage: number }>;
  dominantColors: DominantColorResult[];
}

// -----------------------------------------------------------------------------
// Deep Analysis
// -----------------------------------------------------------------------------

async function analyzeImage(imagePath: string, limit: number = 20): Promise<AnalysisResult> {
  const absolutePath = path.resolve(imagePath);
  const image = sharp(absolutePath);
  const metadata = await image.metadata();

  // Resize for analysis (same as color-extraction.ts)
  const resized = image.resize(100, 100, { fit: "cover" });
  const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const pixelCounts = new Map<string, { rgb: [number, number, number]; count: number }>();
  let opaquePixels = 0;
  let transparentPixels = 0;

  const hasAlpha = info.channels === 4;
  const step = hasAlpha ? 4 : 3;
  const totalPixels = data.length / step;

  // Sample pixels and quantize (same logic as color-extraction.ts)
  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (hasAlpha) {
      const a = data[i + 3];
      if (a < 128) {
        transparentPixels++;
        continue;
      }
    }

    // Quantize to reduce color space (divide by 16, so 16 levels per channel)
    const qr = Math.floor(r / 16) * 16;
    const qg = Math.floor(g / 16) * 16;
    const qb = Math.floor(b / 16) * 16;

    const key = `${qr},${qg},${qb}`;
    const existing = pixelCounts.get(key);

    if (existing) {
      existing.count++;
      existing.rgb[0] += r;
      existing.rgb[1] += g;
      existing.rgb[2] += b;
    } else {
      pixelCounts.set(key, { rgb: [r, g, b], count: 1 });
    }

    opaquePixels++;
  }

  // Sort buckets by count
  // Calculate percentage of opaque pixels (what the extraction actually uses for color confidence)
  const sortedBuckets = Array.from(pixelCounts.entries())
    .map(([key, value]) => ({
      quantizedKey: key,
      avgRgb: [Math.round(value.rgb[0] / value.count), Math.round(value.rgb[1] / value.count), Math.round(value.rgb[2] / value.count)] as [number, number, number],
      count: value.count,
      percentage: opaquePixels > 0 ? (value.count / opaquePixels) * 100 : 0,
      tag: findClosestColorTag([Math.round(value.rgb[0] / value.count), Math.round(value.rgb[1] / value.count), Math.round(value.rgb[2] / value.count)]),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  // Aggregate by tag
  // Color percentages are calculated against opaque pixels only (transparent pixels don't dilute colors)
  const tagSummary = new Map<string, { count: number; percentage: number }>();

  // Transparency is reported separately as percentage of total pixels
  if (transparentPixels > 0) {
    tagSummary.set("transparent", {
      count: transparentPixels,
      percentage: (transparentPixels / totalPixels) * 100,
    });
  }

  // Color tags use opaque pixel percentages
  for (const bucket of Array.from(pixelCounts.values())) {
    const avgRgb: [number, number, number] = [Math.round(bucket.rgb[0] / bucket.count), Math.round(bucket.rgb[1] / bucket.count), Math.round(bucket.rgb[2] / bucket.count)];
    const tag = findClosestColorTag(avgRgb);
    const existing = tagSummary.get(tag) ?? { count: 0, percentage: 0 };
    existing.count += bucket.count;
    existing.percentage = opaquePixels > 0 ? (existing.count / opaquePixels) * 100 : 0;
    tagSummary.set(tag, existing);
  }

  // Get the dominant colors using the actual extraction function
  const dominantColors = await extractDominantColors(absolutePath, 5);

  return {
    imagePath: absolutePath,
    dimensions: { width: metadata.width ?? 0, height: metadata.height ?? 0 },
    totalPixels,
    opaquePixels,
    transparentPixels,
    transparencyPercentage: (transparentPixels / totalPixels) * 100,
    colorBuckets: sortedBuckets,
    tagSummary,
    dominantColors,
  };
}

// -----------------------------------------------------------------------------
// CLI Output Formatting
// -----------------------------------------------------------------------------

function formatRgb(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function formatHsl(hsl: [number, number, number]): string {
  const [h, s, l] = hsl;
  return `hsl(${h.toFixed(0)}°, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%)`;
}

function getHslFromRgb(rgb: [number, number, number]): [number, number, number] {
  return rgbToHsl(rgb[0], rgb[1], rgb[2]);
}

function colorBlock(rgb: [number, number, number]): string {
  // ANSI 24-bit color escape sequence for terminal
  return `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m  \x1b[0m`;
}

function printResults(result: AnalysisResult, verbose: boolean): void {
  console.log("\n" + "=".repeat(80));
  console.log("COLOR ANALYSIS REPORT");
  console.log("=".repeat(80));

  console.log(`\n📁 Image: ${result.imagePath}`);
  console.log(`📐 Dimensions: ${result.dimensions.width} x ${result.dimensions.height}`);
  console.log(`🔢 Total Pixels (sampled): ${result.totalPixels.toLocaleString()}`);
  console.log(`   Opaque: ${result.opaquePixels.toLocaleString()} (${((result.opaquePixels / result.totalPixels) * 100).toFixed(1)}%)`);
  console.log(`   Transparent: ${result.transparentPixels.toLocaleString()} (${result.transparencyPercentage.toFixed(1)}%)`);

  // Tag Summary
  console.log("\n" + "-".repeat(80));
  console.log("TAG SUMMARY (aggregated by color tag)");
  console.log("-".repeat(80));

  const sortedTags = Array.from(result.tagSummary.entries()).sort((a, b) => b[1].percentage - a[1].percentage);

  console.log("\n  Tag           Pixels      Percentage  Bar");
  console.log("  " + "-".repeat(60));

  for (const [tag, data] of sortedTags) {
    const barLength = Math.round(data.percentage / 2);
    const bar = "█".repeat(barLength);
    console.log(`  ${tag.padEnd(12)}  ${data.count.toString().padStart(8)}  ${data.percentage.toFixed(1).padStart(8)}%  ${bar}`);
  }

  // Dominant Colors (actual extraction result)
  console.log("\n" + "-".repeat(80));
  console.log("EXTRACTED DOMINANT COLORS (what gets saved to DB)");
  console.log("-".repeat(80));

  for (let i = 0; i < result.dominantColors.length; i++) {
    const color = result.dominantColors[i];
    const block = color.colorTag === "transparent" ? "░░" : colorBlock(color.rgb);
    console.log(`  ${i + 1}. ${block} ${color.colorTag.padEnd(12)} ${formatRgb(color.rgb).padEnd(22)} confidence: ${(color.confidence * 100).toFixed(1)}%`);
  }

  // Verbose: Show individual color buckets
  if (verbose) {
    console.log("\n" + "-".repeat(80));
    console.log("TOP COLOR BUCKETS (quantized pixel groups)");
    console.log("-".repeat(80));

    console.log("\n  #   Color  Tag          RGB                    HSL                        Pixels    %");
    console.log("  " + "-".repeat(90));

    for (let i = 0; i < result.colorBuckets.length; i++) {
      const bucket = result.colorBuckets[i];
      const block = colorBlock(bucket.avgRgb);
      const hsl = formatHsl(getHslFromRgb(bucket.avgRgb));
      console.log(`  ${(i + 1).toString().padStart(2)}. ${block} ${bucket.tag.padEnd(12)} ${formatRgb(bucket.avgRgb).padEnd(22)} ${hsl.padEnd(26)} ${bucket.count.toString().padStart(6)} ${bucket.percentage.toFixed(2).padStart(6)}%`);
    }
  }

  console.log("\n" + "=".repeat(80) + "\n");
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: pnpm analyze-colors <image-path> [options]

Options:
  --limit=N    Number of color buckets to show (default: 20)
  --verbose    Show detailed color bucket breakdown
  --help, -h   Show this help message

Examples:
  pnpm analyze-colors ./test.png
  pnpm analyze-colors ./test.png --limit=10
  pnpm analyze-colors ./test.png --verbose
  pnpm analyze-colors /path/to/thumbnail.png --verbose --limit=30
`);
    process.exit(0);
  }

  const imagePath = args.find((a) => !a.startsWith("--"));
  const verbose = args.includes("--verbose");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 20;

  if (!imagePath) {
    console.error("Error: Please provide an image path");
    process.exit(1);
  }

  try {
    console.log(`\nAnalyzing: ${imagePath}...`);
    const result = await analyzeImage(imagePath, limit);
    printResults(result, verbose);
  } catch (error) {
    console.error("Error analyzing image:", error);
    process.exit(1);
  }
}

main();
