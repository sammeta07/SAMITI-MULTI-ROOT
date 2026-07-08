-- Migration 027: Create mapping table between events and selectable voting roles
-- Purpose: Allow committee admins to configure role set per event from events_roles_master.

CREATE TABLE IF NOT EXISTS event_voting_roles (
  event_id INT NOT NULL,
  role_id INT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, role_id),
  CONSTRAINT fk_event_voting_roles_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_voting_roles_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_event_voting_roles_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_event_voting_roles_role_id ON event_voting_roles(role_id);
