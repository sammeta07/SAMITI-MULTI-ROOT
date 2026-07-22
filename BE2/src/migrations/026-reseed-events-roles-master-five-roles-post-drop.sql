-- Migration 026: Reseed events_roles_master after dropping role_code/description
-- Purpose: Ensure only approved five roles remain even after repeat migration runs.
-- NOTE: After migration 049, DELETE on this table is blocked by a trigger.
--       If re-running migrations, drop the trigger first or adjust accordingly.

DELETE FROM events_roles_master;

ALTER TABLE events_roles_master AUTO_INCREMENT = 1;

INSERT INTO events_roles_master (
  hindi_name,
  english_name,
  role_name,
  is_active,
  sort_order
)
VALUES
  ('adhyaksha', 'president', 'adhyaksha', 1, 10),
  ('upadhyaksha', 'vice_president', 'upadhyaksha', 1, 20),
  ('sachiv', 'general_secretary', 'sachiv', 1, 30),
  ('koshadhyaksha', 'treasurer', 'koshadhyaksha', 1, 40),
  ('aankshak', 'auditor', 'aankshak', 1, 50);
