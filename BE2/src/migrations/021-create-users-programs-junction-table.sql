-- Migration: Canonical junction table for program-user designation mapping

CREATE TABLE IF NOT EXISTS users_programs (
  program_id INT NOT NULL,
  user_id INT NOT NULL,
  designation VARCHAR(50) NULL,
  status VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (program_id, user_id),
  CONSTRAINT fk_users_programs_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_programs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_programs_user_id ON users_programs(user_id);
CREATE INDEX idx_users_programs_program_status ON users_programs(program_id, status);
