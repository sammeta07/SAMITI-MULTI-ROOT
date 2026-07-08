-- Migration 023: Add bilingual role names to events_roles_master
-- Purpose: Store both Hindi and English role names and seed canonical event role set.

ALTER TABLE events_roles_master
  ADD COLUMN hindi_name VARCHAR(100) NULL AFTER role_id;

ALTER TABLE events_roles_master
  ADD COLUMN english_name VARCHAR(100) NULL AFTER hindi_name;

CREATE UNIQUE INDEX uq_events_roles_master_hindi_name ON events_roles_master(hindi_name);
CREATE UNIQUE INDEX uq_events_roles_master_english_name ON events_roles_master(english_name);

-- Backfill bilingual names for existing records where possible
UPDATE events_roles_master
SET hindi_name = role_name
WHERE (hindi_name IS NULL OR TRIM(hindi_name) = '')
  AND role_name IS NOT NULL
  AND TRIM(role_name) <> '';

UPDATE events_roles_master
SET english_name = LOWER(role_code)
WHERE (english_name IS NULL OR TRIM(english_name) = '')
  AND role_code IS NOT NULL
  AND TRIM(role_code) <> '';

-- Canonical bilingual role set requested by product
INSERT INTO events_roles_master (
  hindi_name,
  english_name,
  role_name,
  role_code,
  description,
  is_active,
  sort_order
)
VALUES
  ('adhyaksha', 'president', 'adhyaksha', 'PRESIDENT', 'Committee/event president role', 1, 10),
  ('upadhyaksha', 'vice_president', 'upadhyaksha', 'VICE_PRESIDENT', 'Committee/event vice president role', 1, 20),
  ('sachiv', 'general_secretary', 'sachiv', 'GENERAL_SECRETARY', 'General secretary role', 1, 30),
  ('saha_sachiv', 'joint_secretary', 'saha_sachiv', 'JOINT_SECRETARY', 'Joint secretary role', 1, 40),
  ('koshadhyaksha', 'treasurer', 'koshadhyaksha', 'TREASURER', 'Treasurer role', 1, 50),
  ('upa_koshadhyaksha', 'assistant_treasurer', 'upa_koshadhyaksha', 'ASSISTANT_TREASURER', 'Assistant treasurer role', 1, 60),
  ('sanyojak', 'convenor', 'sanyojak', 'CONVENOR', 'Convenor role', 1, 70),
  ('prabandhak', 'manager', 'prabandhak', 'MANAGER', 'Manager role', 1, 80),
  ('karyakarini_sadasya', 'executive_member', 'karyakarini_sadasya', 'EXECUTIVE_MEMBER', 'Executive member role', 1, 90),
  ('sanrakshak_salahkar', 'patron_advisor', 'sanrakshak_salahkar', 'PATRON_ADVISOR', 'Patron advisor role', 1, 100),
  ('prachar_mantri', 'public_relations_officer', 'prachar_mantri', 'PUBLIC_RELATIONS_OFFICER', 'Public relations officer role', 1, 110),
  ('aankshak', 'auditor', 'aankshak', 'AUDITOR', 'Auditor role', 1, 120)
ON DUPLICATE KEY UPDATE
  english_name = VALUES(english_name),
  role_name = VALUES(role_name),
  role_code = VALUES(role_code),
  description = VALUES(description),
  is_active = VALUES(is_active),
  sort_order = VALUES(sort_order),
  updated_at = CURRENT_TIMESTAMP;
