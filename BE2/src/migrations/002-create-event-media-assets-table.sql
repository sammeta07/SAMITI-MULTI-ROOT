CREATE TABLE IF NOT EXISTS event_media_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  media_url LONGTEXT NOT NULL,
  media_type VARCHAR(50) NOT NULL DEFAULT 'BANNER',
  sort_order INT NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_media_assets_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_media_assets_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_event_media_assets_event_id ON event_media_assets(event_id);
CREATE INDEX idx_event_media_assets_sort_order ON event_media_assets(sort_order);
