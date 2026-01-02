import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// Load .env file
// -----------------------------------------------------------------------------

const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`[CONFIG] Loaded .env from ${envPath}`);
}

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export const PROCREATE_DIR = process.env.PROCREATE_SOURCE_PATH ?? "/app/media/procreate";
export const THUMBNAIL_DIR = process.env.PROCREATE_THUMBNAIL_PATH ?? "/app/media/thumbnails";
export const DB_PATH = process.env.PROCREATE_DATABASE_PATH ?? "/app/db/procreate.db";
export const SIMILARITY_THRESHOLD = Number(process.env.SIMILARITY_THRESHOLD ?? 0.75);
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.resolve(__dirname, "../migrations");
export const AUTO_COLOR_TAG = (process.env.AUTO_COLOR_TAG ?? "true").toLowerCase() !== "false";
export const AUTO_COLOR_TAG_LIMIT = Math.min(5, Math.max(1, Number(process.env.AUTO_COLOR_TAG_LIMIT ?? 1)));
export const AUTO_COLOR_TAG_THRESHOLD = Math.max(0, Number(process.env.AUTO_COLOR_TAG_THRESHOLD ?? 0));

// -----------------------------------------------------------------------------
// Ensure directories exist
// -----------------------------------------------------------------------------

fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// -----------------------------------------------------------------------------
// Log configuration
// -----------------------------------------------------------------------------

export function logConfig() {
  console.log(`[CONFIG] PROCREATE_DIR: ${PROCREATE_DIR}`);
  console.log(`[CONFIG] THUMBNAIL_DIR: ${THUMBNAIL_DIR}`);
  console.log(`[CONFIG] DB_PATH: ${DB_PATH}`);
  console.log(`[CONFIG] SIMILARITY_THRESHOLD: ${SIMILARITY_THRESHOLD}`);
  console.log(`[CONFIG] AUTO_COLOR_TAG: ${AUTO_COLOR_TAG}`);
  console.log(`[CONFIG] AUTO_COLOR_TAG_LIMIT: ${AUTO_COLOR_TAG_LIMIT}`);
  console.log(`[CONFIG] AUTO_COLOR_TAG_THRESHOLD: ${AUTO_COLOR_TAG_THRESHOLD}%`);
}
