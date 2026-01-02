import { logConfig } from "./config.js";
import { db, runMigrations } from "./database.js";
import { performInitialScan } from "./scan.js";
import { startWatcher, stopWatcher } from "./watch.js";
import { resumeProcessing } from "./queue.js";

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

logConfig();
runMigrations();

// -----------------------------------------------------------------------------
// Resume Any Pending Queue Items (from previous run)
// -----------------------------------------------------------------------------

resumeProcessing();

// -----------------------------------------------------------------------------
// Initial Scan (non-blocking)
// -----------------------------------------------------------------------------

performInitialScan();

// -----------------------------------------------------------------------------
// Start Watcher
// -----------------------------------------------------------------------------

const watcher = startWatcher();

// -----------------------------------------------------------------------------
// Graceful Shutdown
// -----------------------------------------------------------------------------

function shutdown() {
  console.log("\n[SHUTDOWN] Closing watcher...");
  stopWatcher();
  db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
