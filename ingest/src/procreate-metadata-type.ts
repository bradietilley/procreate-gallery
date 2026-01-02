export interface ProcreateMetadata {
  canvas_width: number;
  canvas_height: number;
  dpi: number;
  orientation: "portrait" | "landscape" | "unknown";
  created_at: number | null;
  updated_at: number | null;
  layer_count: number;
  time_spent: number;
  color_profile?: string;
  procreate_version?: string;

  source_path: string;
  file_hash: string;
  thumbnail_path: string | null;
}

export interface VectorResult {
  vector: number[];
  source_path: string;
  dimensions: number;
}
