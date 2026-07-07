CREATE TABLE IF NOT EXISTS program_media_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id INT NOT NULL,
  media_url LONGTEXT NOT NULL,
  media_type VARCHAR(50) NOT NULL DEFAULT 'BANNER',
  sort_order INT NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_program_media_assets_program
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_program_media_assets_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_program_media_assets_program_id ON program_media_assets(program_id);
CREATE INDEX idx_program_media_assets_sort_order ON program_media_assets(sort_order);
