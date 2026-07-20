-- Migration 043: Create event interest expression table
-- Purpose: Let any committee member/admin express interest in a mapped voting role
-- for an event. A MASTER_ADMIN reviews each expression (APPROVED/REJECTED).

CREATE TABLE IF NOT EXISTS event_interest_expressions (
  id INT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  role_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by INT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_role_user (event_id, role_id, user_id),
  CONSTRAINT fk_event_interest_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_interest_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_event_interest_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_interest_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_event_interest_event_role ON event_interest_expressions(event_id, role_id);
CREATE INDEX idx_event_interest_status ON event_interest_expressions(status);
