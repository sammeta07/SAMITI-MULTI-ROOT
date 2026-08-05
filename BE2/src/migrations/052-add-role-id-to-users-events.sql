-- Migration: Add role_id to users_events for direct role assignment tracking

ALTER TABLE users_events
  ADD COLUMN role_id INT NULL,
  ADD CONSTRAINT fk_users_events_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE SET NULL;

CREATE INDEX idx_users_events_role_id ON users_events(role_id);
