ALTER TABLE programs
  ADD COLUMN owner_user_id INT NULL,
  ADD COLUMN owner_assigned_by INT NULL,
  ADD COLUMN owner_assigned_at TIMESTAMP NULL,
  ADD CONSTRAINT fk_programs_owner_user
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_programs_owner_assigned_by
    FOREIGN KEY (owner_assigned_by) REFERENCES users(id) ON DELETE SET NULL;
