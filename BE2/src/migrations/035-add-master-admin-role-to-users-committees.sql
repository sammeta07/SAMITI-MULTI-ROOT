-- Migration 035: Add COMMITTEE_MASTER_ADMIN to users_committees.committee_role enum
-- Creator of a committee is stored as COMMITTEE_MASTER_ADMIN.

ALTER TABLE users_committees
  MODIFY COLUMN committee_role ENUM('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') NULL AFTER user_id;
