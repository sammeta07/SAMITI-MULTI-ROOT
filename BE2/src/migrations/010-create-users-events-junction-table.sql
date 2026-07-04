-- Migration: Canonical junction table for event-user mapping
-- Goal: Use users_events as source of truth while keeping backward compatibility via event_members view

CREATE TABLE IF NOT EXISTS users_events (
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  designation VARCHAR(50) NULL,
  status VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, user_id),
  CONSTRAINT fk_users_events_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_events_user_id ON users_events(user_id);
CREATE INDEX idx_users_events_event_status ON users_events(event_id, status);

INSERT IGNORE INTO users_events (event_id, user_id, designation, status, created_at, updated_at)
SELECT event_id, user_id, designation, status, created_at, updated_at
FROM event_members;

DROP VIEW IF EXISTS event_members;
DROP TABLE IF EXISTS event_members;

CREATE VIEW event_members AS
SELECT
  event_id,
  user_id,
  designation,
  status,
  created_at,
  updated_at
FROM users_events;
