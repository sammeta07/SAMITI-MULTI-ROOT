-- Migration 033: Add a single committee_role column to users_committees
-- Phase 1 (backward compatible): keep old flags, backfill role from flags.

ALTER TABLE users_committees
  ADD COLUMN committee_role ENUM('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN') NULL AFTER user_id;

UPDATE users_committees
SET committee_role = CASE
  WHEN COALESCE(is_committee_admin, 0) = 1 THEN 'COMMITTEE_ADMIN'
  WHEN COALESCE(is_committee_member, 0) = 1 THEN 'COMMITTEE_MEMBER'
  ELSE NULL
END
WHERE committee_role IS NULL;

CREATE INDEX idx_users_committees_committee_role ON users_committees(committee_id, committee_role);
