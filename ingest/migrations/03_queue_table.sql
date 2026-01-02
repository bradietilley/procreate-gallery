-- =============================================================================
-- Queue Table for Persistent Processing
-- =============================================================================

-- Processing queue for files awaiting ingestion
-- Supports multiple queue types and prevents duplicate processing
CREATE TABLE IF NOT EXISTS processing_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Queue identification
  queue_type TEXT NOT NULL,  -- 'metadata', 'vector', 'color_tag'
  
  -- Item data (JSON for flexibility across queue types)
  payload TEXT NOT NULL,  -- JSON object with queue-specific data
  
  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
  
  -- Locking for concurrent processing
  locked_at TIMESTAMP,  -- When processing started (null if not locked)
  locked_by TEXT,       -- Process identifier that holds the lock
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Indexes for efficient queue operations
CREATE INDEX IF NOT EXISTS idx_queue_type_status ON processing_queue(queue_type, status);
CREATE INDEX IF NOT EXISTS idx_queue_status ON processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_locked_at ON processing_queue(locked_at);

-- Unique constraint to prevent duplicate queue entries for same file
-- Uses payload hash for metadata queue (file_path) to prevent re-queuing same file
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_unique_pending 
  ON processing_queue(queue_type, payload) 
  WHERE status IN ('pending', 'processing');

