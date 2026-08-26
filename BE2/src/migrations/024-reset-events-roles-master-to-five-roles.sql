-- Migration 024: Reset events_roles_master to 4 canonical bilingual roles
-- Purpose: Keep only the explicitly approved role set.
-- NOTE: Migration 049 adds a DELETE-protection trigger. We drop it here
--       so this DELETE is re-runnable; migration 049 recreates the trigger.

DROP TRIGGER IF EXISTS trg_events_roles_master_block_delete;

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
  ('koshadhyaksha', 'treasurer', 'koshadhyaksha', 'TREASURER', 1, 30),
  ('aankshak', 'auditor', 'aankshak', 'AUDITOR', 1, 40);
