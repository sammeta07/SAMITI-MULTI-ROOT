CREATE TABLE IF NOT EXISTS event_members (
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  designation VARCHAR(50) NULL,
  status VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, user_id),
  CONSTRAINT fk_event_members_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE event_members
  ADD COLUMN IF NOT EXISTS designation VARCHAR(50) NULL;

ALTER TABLE event_members
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NULL;

ALTER TABLE event_members
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE event_members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX idx_event_members_user_id ON event_members(user_id);
CREATE INDEX idx_event_members_event_status ON event_members(event_id, status);
