-- Migration 034: Remove legacy committee membership flag columns
-- committee_role is now the single source of truth.

ALTER TABLE users_committees
  DROP COLUMN is_committee_admin;

ALTER TABLE users_committees
  DROP COLUMN is_committee_member;
