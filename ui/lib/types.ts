export interface ProcreateFile {
  id: number;
  file_name: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  vector?: string;
  thumbnail_path: string;

  // Canvas metadata
  canvas_width?: number;
  canvas_height?: number;
  dpi?: number;
  orientation?: string; // 'portrait', 'landscape', 'unknown'

  // Drawing metadata
  layer_count?: number;
  time_spent?: number; // seconds spent drawing
  color_profile?: string;
  procreate_version?: string;

  // Timestamps (from procreate file)
  file_created_at?: number; // unix timestamp
  file_updated_at?: number; // unix timestamp

  // Database timestamps
  created_at: string;
  updated_at: string;

  tags?: Tag[];
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}
