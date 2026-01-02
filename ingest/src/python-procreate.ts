import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ProcreateMetadata, VectorResult } from "./procreate-metadata-type.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PYTHON_BIN = process.env.PROCREATE_PYTHON_BIN ?? "python3";

/**
 * Resolve the Python script path.
 * In Docker: /app/api/procreate_meta.py
 * Locally: ../python/procreate_meta.py (relative to src/)
 */
function getPythonScriptPath(): string {
  // Docker path
  const dockerPath = "/app/api/procreate_meta.py";
  if (existsSync(dockerPath)) {
    return dockerPath;
  }

  // Local development path (relative to src/)
  const localPath = resolve(__dirname, "../python/procreate_meta.py");
  if (existsSync(localPath)) {
    return localPath;
  }

  throw new Error(`Python script not found. Checked:\n  - ${dockerPath}\n  - ${localPath}`);
}

const PYTHON_SCRIPT = getPythonScriptPath();
console.log(`[CONFIG] PYTHON_SCRIPT: ${PYTHON_SCRIPT}`);

/**
 * Execute a Python command and return stdout.
 */
function execPython(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [PYTHON_SCRIPT, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Python command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Python exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Call the Python metadata extractor.
 */
export async function inspectProcreate(filePath: string): Promise<ProcreateMetadata> {
  const stdout = await execPython(["inspect", filePath], 30_000);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Failed to parse Python metadata JSON for ${filePath}\n${stdout}`);
  }

  return parsed as ProcreateMetadata;
}

/**
 * Extract CLIP vector embedding from a thumbnail image.
 */
export async function extractVector(imagePath: string): Promise<VectorResult> {
  const stdout = await execPython(["vector", imagePath], 120_000); // CLIP model loading can take time

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Failed to parse Python vector JSON for ${imagePath}\n${stdout}`);
  }

  return parsed as VectorResult;
}
