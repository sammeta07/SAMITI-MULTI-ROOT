-- Migration 045: Create event votes table
-- Purpose: Record committee members' votes cast during the voting phase
-- (voting_phase_state = 4). One vote per voter per role. The voter chooses
-- one approved candidate (event_interest_expressions row with status APPROVED).

CREATE TABLE IF NOT EXISTS event_votes (
  id INT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  role_id INT NOT NULL,
  voter_id INT NOT NULL,
  candidate_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_role_voter (event_id, role_id, voter_id),
  CONSTRAINT fk_event_vote_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_vote_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_event_vote_voter FOREIGN KEY (voter_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_vote_candidate FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_event_vote_event ON event_votes(event_id);
CREATE INDEX idx_event_vote_event_role ON event_votes(event_id, role_id);
