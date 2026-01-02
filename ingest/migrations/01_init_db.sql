-- =============================================================================
-- Procreate Database Schema
-- =============================================================================

-- Main table for procreate files with full metadata
CREATE TABLE IF NOT EXISTS procreate_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- File identity
  file_name TEXT NOT NULL,
  file_path TEXT UNIQUE NOT NULL,
  file_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  
  -- Thumbnail and vector (for similarity)
  thumbnail_path TEXT NOT NULL,
  vector TEXT,  -- JSON array of floats, nullable until processed
  
  -- Canvas metadata
  canvas_width INTEGER,
  canvas_height INTEGER,
  dpi INTEGER,
  orientation TEXT,  -- 'portrait', 'landscape', 'unknown'
  
  -- Drawing metadata
  layer_count INTEGER,
  time_spent INTEGER,  -- seconds spent drawing
  color_profile TEXT,
  procreate_version TEXT,
  
  -- Timestamps
  file_created_at INTEGER,   -- unix timestamp from procreate file
  file_updated_at INTEGER,   -- unix timestamp from procreate file
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Image similarity pairs (for CLIP-based similar images)
CREATE TABLE IF NOT EXISTS image_similarities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  procreate_id_1 INTEGER NOT NULL,
  procreate_id_2 INTEGER NOT NULL,
  similarity_score REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(procreate_id_1, procreate_id_2),
  CHECK (procreate_id_1 < procreate_id_2),
  FOREIGN KEY (procreate_id_1) REFERENCES procreate_files(id) ON DELETE CASCADE,
  FOREIGN KEY (procreate_id_2) REFERENCES procreate_files(id) ON DELETE CASCADE
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Junction table linking file_hash to tags (persists across file moves/deletions)
CREATE TABLE IF NOT EXISTS procreate_hash_tags (
  file_hash TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (file_hash, tag_id),
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Migrations tracking table
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- procreate_files indexes
CREATE INDEX IF NOT EXISTS idx_procreate_file_name ON procreate_files(file_name);
CREATE INDEX IF NOT EXISTS idx_procreate_file_path ON procreate_files(file_path);
CREATE INDEX IF NOT EXISTS idx_procreate_file_size ON procreate_files(file_size);
CREATE INDEX IF NOT EXISTS idx_procreate_file_hash ON procreate_files(file_hash);

-- Similarity indexes
CREATE INDEX IF NOT EXISTS idx_similarities_score ON image_similarities(similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_similarities_id1 ON image_similarities(procreate_id_1);
CREATE INDEX IF NOT EXISTS idx_similarities_id2 ON image_similarities(procreate_id_2);

-- Tag indexes
CREATE INDEX IF NOT EXISTS idx_procreate_hash_tags_file_hash ON procreate_hash_tags(file_hash);
CREATE INDEX IF NOT EXISTS idx_procreate_hash_tags_tag_id ON procreate_hash_tags(tag_id);
