CREATE TABLE IF NOT EXISTS event_voting_role_nominations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  role_id INT NOT NULL,
  user_id INT NOT NULL,
  nominated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_event_voting_role_nominations_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_voting_role_nominations_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_event_voting_role_nominations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_event_voting_role_nominations_event_user UNIQUE (event_id, user_id)
);

CREATE INDEX idx_event_voting_role_nominations_event_role ON event_voting_role_nominations(event_id, role_id);
CREATE INDEX idx_event_voting_role_nominations_event ON event_voting_role_nominations(event_id);
