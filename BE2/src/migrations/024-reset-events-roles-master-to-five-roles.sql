-- Migration 024: Reset events_roles_master to required 5 bilingual roles
-- Purpose: Keep only the explicitly approved role set.
-- NOTE: After migration 049, DELETE on this table is blocked by a trigger.
--       If re-running migrations, drop the trigger first or adjust accordingly.

DELETE FROM events_roles_master;

ALTER TABLE events_roles_master AUTO_INCREMENT = 1;

INSERT INTO events_roles_master (
  hindi_name,
  english_name,
  role_name,
  role_code,
  is_active,
  sort_order
)
VALUES
  ('adhyaksha', 'president', 'adhyaksha', 'PRESIDENT', 1, 10),
  ('upadhyaksha', 'vice_president', 'upadhyaksha', 'VICE_PRESIDENT', 1, 20),
  ('sachiv', 'general_secretary', 'sachiv', 'GENERAL_SECRETARY', 1, 30),
  ('koshadhyaksha', 'treasurer', 'koshadhyaksha', 'TREASURER', 1, 40),
  ('aankshak', 'auditor', 'aankshak', 'AUDITOR', 1, 50);
