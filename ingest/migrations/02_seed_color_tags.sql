-- =============================================================================
-- Seed Default Color Tags
-- =============================================================================

-- Insert default color tags with their corresponding hex colors
-- These tags are used for automatic color-based tagging of artwork

INSERT OR IGNORE INTO tags (name, color) VALUES
  ('red', '#EF4444'),
  ('orange', '#F97316'),
  ('yellow', '#EAB308'),
  ('green', '#22C55E'),
  ('blue', '#3B82F6'),
  ('purple', '#A855F7'),
  ('pink', '#EC4899'),
  ('black', '#171717'),
  ('white', '#F5F5F5'),
  ('brown', '#A16207'),
  ('gray', '#6B7280'),
  ('transparent', '#333');

