-- Migration 026: Reseed events_roles_master after dropping role_code/description
-- Purpose: Ensure only approved 4 roles remain even after repeat migration runs.
-- NOTE: Migration 049 adds a DELETE-protection trigger. We drop it here
--       so this DELETE is re-runnable; migration 049 recreates the trigger.

DROP TRIGGER IF EXISTS trg_events_roles_master_block_delete;

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
  ('koshadhyaksha', 'treasurer', 'koshadhyaksha', 1, 30),
  ('aankshak', 'auditor', 'aankshak', 1, 40);
