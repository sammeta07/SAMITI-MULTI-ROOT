CREATE TABLE IF NOT EXISTS event_winners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  role_id INT NOT NULL,
  winner_user_id INT NOT NULL,
  winner_name VARCHAR(255) NOT NULL,
  winner_photo VARCHAR(255),
  winner_vote_count INT NOT NULL DEFAULT 0,
  declared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_event_role (event_id, role_id)
);
