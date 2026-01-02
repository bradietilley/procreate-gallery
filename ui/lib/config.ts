import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// -----------------------------------------------------------------------------
// Load .env file from root directory (one level up from ui/)
// -----------------------------------------------------------------------------

const envPath = path.resolve("../.env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`[CONFIG] Loaded .env from ${envPath}`);
}

/**
 * Centralized configuration for environment variables.
 * These can be overridden via docker-compose.yml environment section or .env file.
 */

// Database path - defaults to ./db/procreate.db for local development
export const PROCREATE_DATABASE_PATH = process.env.PROCREATE_DATABASE_PATH || path.resolve("./db/procreate.db");

// Procreate files directory - where .procreate files are stored
export const PROCREATE_SOURCE_PATH = process.env.PROCREATE_SOURCE_PATH || path.resolve("./media/procreate");

// Thumbnails directory - where extracted thumbnails are stored
export const PROCREATE_THUMBNAIL_PATH = process.env.PROCREATE_THUMBNAIL_PATH || path.resolve("./media/thumbnails");

/**
 * Resolves a relative path stored in the database to an absolute path.
 * @param relativePath - The relative path stored in the database
 * @param basePath - The base directory path (PROCREATE_SOURCE_PATH or PROCREATE_THUMBNAIL_PATH)
 * @returns The absolute path
 */
export function resolveMediaPath(relativePath: string, basePath: string): string {
  // If the path is already absolute, return it as-is (for backwards compatibility during migration)
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return path.join(basePath, relativePath);
}

/**
 * Resolves a procreate file's relative path to an absolute path.
 */
export function resolveProcreateFilePath(relativePath: string): string {
  return resolveMediaPath(relativePath, PROCREATE_SOURCE_PATH);
}

/**
 * Resolves a thumbnail's relative path to an absolute path.
 */
export function resolveThumbnailPath(relativePath: string): string {
  return resolveMediaPath(relativePath, PROCREATE_THUMBNAIL_PATH);
}
