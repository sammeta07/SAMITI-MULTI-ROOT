ALTER TABLE programs
  ADD COLUMN parent_program_id INT DEFAULT NULL AFTER event_id,
  ADD KEY idx_programs_parent_program_id (parent_program_id),
  ADD CONSTRAINT fk_programs_parent
    FOREIGN KEY (parent_program_id) REFERENCES programs(id) ON DELETE CASCADE;
