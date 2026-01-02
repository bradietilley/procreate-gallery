import sharp from "sharp";

// -----------------------------------------------------------------------------
// Color Tag Definitions
// -----------------------------------------------------------------------------

interface ColorReference {
  tag: string;
  rgb: [number, number, number];
}

// Multiple reference points per color tag for better matching accuracy.
// Colors that fall between primary references will match to the nearest anchor.
const COLOR_REFERENCES: ColorReference[] = [
  // Reds - from bright to dark
  { tag: "red", rgb: [255, 0, 0] }, // Pure red
  { tag: "red", rgb: [220, 20, 60] }, // Crimson
  { tag: "red", rgb: [178, 34, 34] }, // Firebrick (dark red)
  { tag: "red", rgb: [139, 0, 0] }, // Dark red
  { tag: "red", rgb: [255, 99, 71] }, // Tomato (lighter red)
  { tag: "red", rgb: [177, 31, 27] }, // Maroon
  { tag: "red", rgb: [91, 10, 9] }, // Dark red
  { tag: "red", rgb: [190, 0, 0] }, // Dark red

  // Oranges
  { tag: "orange", rgb: [255, 165, 0] }, // Pure orange
  { tag: "orange", rgb: [255, 140, 0] }, // Dark orange
  { tag: "orange", rgb: [255, 127, 80] }, // Coral
  { tag: "orange", rgb: [255, 69, 0] }, // Red-orange

  // Yellows
  { tag: "yellow", rgb: [255, 255, 0] }, // Pure yellow
  { tag: "yellow", rgb: [255, 215, 0] }, // Gold
  { tag: "yellow", rgb: [240, 230, 140] }, // Khaki (muted yellow)
  { tag: "yellow", rgb: [255, 255, 224] }, // Light yellow
  { tag: "yellow", rgb: [246, 180, 28] }, // Golden yellow

  // Greens - from pure to teal to olive
  { tag: "green", rgb: [0, 255, 0] }, // Pure green (lime)
  { tag: "green", rgb: [0, 128, 0] }, // Dark green
  { tag: "green", rgb: [34, 139, 34] }, // Forest green
  { tag: "green", rgb: [50, 205, 50] }, // Lime green
  { tag: "green", rgb: [144, 238, 144] }, // Light green
  { tag: "green", rgb: [0, 128, 128] }, // Teal
  { tag: "green", rgb: [32, 178, 170] }, // Light sea green
  { tag: "green", rgb: [107, 142, 35] }, // Olive green
  { tag: "green", rgb: [85, 107, 47] }, // Dark olive green
  { tag: "green", rgb: [154, 162, 81] }, // Olive green

  // Blues
  { tag: "blue", rgb: [0, 0, 255] }, // Pure blue
  { tag: "blue", rgb: [0, 0, 139] }, // Dark blue
  { tag: "blue", rgb: [65, 105, 225] }, // Royal blue
  { tag: "blue", rgb: [30, 144, 255] }, // Dodger blue
  { tag: "blue", rgb: [135, 206, 235] }, // Sky blue
  { tag: "blue", rgb: [70, 130, 180] }, // Steel blue
  { tag: "blue", rgb: [0, 191, 255] }, // Deep sky blue
  { tag: "blue", rgb: [100, 149, 237] }, // Cornflower blue
  { tag: "blue", rgb: [2, 118, 168] }, // Blue

  // Purples
  { tag: "purple", rgb: [128, 0, 128] }, // Pure purple
  { tag: "purple", rgb: [75, 0, 130] }, // Indigo
  { tag: "purple", rgb: [138, 43, 226] }, // Blue violet
  { tag: "purple", rgb: [148, 0, 211] }, // Dark violet
  { tag: "purple", rgb: [153, 50, 204] }, // Dark orchid
  { tag: "purple", rgb: [186, 85, 211] }, // Medium orchid

  // Pinks
  { tag: "pink", rgb: [255, 192, 203] }, // Pink
  { tag: "pink", rgb: [255, 105, 180] }, // Hot pink
  { tag: "pink", rgb: [255, 20, 147] }, // Deep pink
  { tag: "pink", rgb: [219, 112, 147] }, // Pale violet red
  { tag: "pink", rgb: [255, 182, 193] }, // Light pink
  { tag: "pink", rgb: [255, 0, 255] }, // Magenta/Fuchsia

  // Browns
  { tag: "brown", rgb: [139, 69, 19] }, // Saddle brown
  { tag: "brown", rgb: [160, 82, 45] }, // Sienna
  { tag: "brown", rgb: [210, 105, 30] }, // Chocolate
  { tag: "brown", rgb: [165, 42, 42] }, // Brown
  { tag: "brown", rgb: [128, 70, 27] }, // Russet
  { tag: "brown", rgb: [101, 67, 33] }, // Dark brown
  { tag: "brown", rgb: [193, 154, 107] }, // Tan/khaki brown

  // Achromatic colors (handled specially but included for reference)
  { tag: "black", rgb: [0, 0, 0] },
  { tag: "black", rgb: [25, 25, 25] },
  { tag: "black", rgb: [40, 40, 40] },

  { tag: "white", rgb: [255, 255, 255] },
  { tag: "white", rgb: [245, 245, 245] },
  { tag: "white", rgb: [250, 250, 250] },
  { tag: "white", rgb: [240, 240, 240] },

  { tag: "gray", rgb: [128, 128, 128] },
  { tag: "gray", rgb: [169, 169, 169] }, // Dark gray
  { tag: "gray", rgb: [192, 192, 192] }, // Silver
  { tag: "gray", rgb: [105, 105, 105] }, // Dim gray
  { tag: "gray", rgb: [80, 80, 80] },
];

// Unique tag names for export (including "transparent" as a special tag)
const UNIQUE_TAG_NAMES = [...new Set(COLOR_REFERENCES.map((r) => r.tag)), "transparent"];

// -----------------------------------------------------------------------------
// Color Distance Calculation
// -----------------------------------------------------------------------------

/**
 * Calculate the Euclidean distance between two RGB colors.
 * Lower values mean more similar colors.
 */
function colorDistance(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const dr = rgb1[0] - rgb2[0];
  const dg = rgb1[1] - rgb2[1];
  const db = rgb1[2] - rgb2[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Convert RGB to HSL for better color classification.
 * Returns [hue (0-360), saturation (0-1), lightness (0-1)]
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l]; // achromatic
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return [h * 360, s, l];
}

/**
 * Find the closest matching color tag for an RGB color.
 * Uses HSL for achromatic detection (black, white, gray) and RGB distance for chromatic colors.
 */
export function findClosestColorTag(rgb: [number, number, number]): string {
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);

  // Handle achromatic colors (low saturation)
  // Be more aggressive with white detection for light, low-saturation colors
  if (s < 0.12) {
    if (l < 0.2) return "black";
    if (l > 0.7) return "white";
    return "gray";
  }

  // Handle very dark colors
  if (l < 0.12) return "black";

  // Handle very light colors (high lightness with low-medium saturation)
  if (l > 0.85 && s < 0.3) return "white";
  if (l > 0.92) return "white";

  // For chromatic colors, find the closest reference point
  let closestTag = "gray";
  let minDistance = Infinity;

  // Compare against all chromatic color references
  const chromaticRefs = COLOR_REFERENCES.filter((r) => !["black", "white", "gray"].includes(r.tag));

  for (const ref of chromaticRefs) {
    const distance = colorDistance(rgb, ref.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestTag = ref.tag;
    }
  }

  return closestTag;
}

// -----------------------------------------------------------------------------
// Dominant Color Extraction
// -----------------------------------------------------------------------------

export interface DominantColorResult {
  colorTag: string;
  rgb: [number, number, number];
  confidence: number;
}

/**
 * Extract the top N dominant colors from an image.
 * Uses color quantization and frequency analysis.
 */
export async function extractDominantColors(imagePath: string, limit: number = 1): Promise<DominantColorResult[]> {
  const image = sharp(imagePath);

  // Resize to a small size for faster processing and to reduce noise
  const resized = image.resize(100, 100, { fit: "cover" });

  // Get raw pixel data with alpha channel preserved
  const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const pixelCounts = new Map<string, { rgb: [number, number, number]; count: number }>();
  let opaquePixels = 0;
  let transparentPixels = 0;

  // Determine step size based on whether image has alpha channel
  const hasAlpha = info.channels === 4;
  const step = hasAlpha ? 4 : 3;
  const totalPixelCount = data.length / step;

  // Sample pixels and quantize to reduce color space
  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Track transparent pixels separately (alpha < 128)
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
      // Accumulate actual RGB values for averaging later
      existing.rgb[0] += r;
      existing.rgb[1] += g;
      existing.rgb[2] += b;
    } else {
      pixelCounts.set(key, { rgb: [r, g, b], count: 1 });
    }

    opaquePixels++;
  }

  // Sort buckets by count (descending)
  const sortedBuckets = Array.from(pixelCounts.values()).sort((a, b) => b.count - a.count);

  // Extract top colors and map to color tags
  const results: DominantColorResult[] = [];
  const usedTags = new Set<string>();

  // Check if >5% of the image is transparent - add "transparent" as a color tag
  // Transparency ratio is calculated against total pixels (to determine if image has transparency)
  const transparencyRatio = transparentPixels / totalPixelCount;
  if (transparencyRatio > 0.05) {
    results.push({
      colorTag: "transparent",
      rgb: [0, 0, 0], // Placeholder RGB for transparent
      confidence: transparencyRatio,
    });
    usedTags.add("transparent");
  }

  // Count non-transparent tags separately (transparent doesn't count toward limit)
  let colorTagCount = 0;

  for (const bucket of sortedBuckets) {
    if (colorTagCount >= limit) break;

    const avgRgb: [number, number, number] = [Math.round(bucket.rgb[0] / bucket.count), Math.round(bucket.rgb[1] / bucket.count), Math.round(bucket.rgb[2] / bucket.count)];

    const colorTag = findClosestColorTag(avgRgb);

    // Skip if we already have this tag (avoid duplicates)
    if (usedTags.has(colorTag)) continue;

    usedTags.add(colorTag);
    // Color confidence is calculated against opaque pixels only
    // This ensures transparent pixels don't dilute color percentages
    // e.g., 90% transparent + 9% red + 1% blue → red=90%, blue=10% (of opaque pixels)
    const colorConfidence = opaquePixels > 0 ? bucket.count / opaquePixels : 0;
    results.push({
      colorTag,
      rgb: avgRgb,
      confidence: colorConfidence,
    });
    colorTagCount++;
  }

  return results;
}

/**
 * Extract the dominant color from an image (convenience wrapper for single color).
 */
export async function extractDominantColor(imagePath: string): Promise<DominantColorResult> {
  const results = await extractDominantColors(imagePath, 1);
  return results[0] ?? { colorTag: "gray", rgb: [128, 128, 128], confidence: 0 };
}

/**
 * Get all available color tag names.
 */
export function getColorTagNames(): string[] {
  return UNIQUE_TAG_NAMES;
}
