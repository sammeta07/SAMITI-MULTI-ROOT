-- ═══════════════════════════════════════════════════════════════════
-- Migration 038: Extend committee_role_requests status enum
-- Purpose: track every role workflow action as its own record.
--          New statuses: PROMOTED / DEMOTED / REMOVED / REJOINED
--          Existing (kept): REQUESTED / ACCEPTED / REJECTED / CANCELLED
-- Safe to re-run: migration runner skips already-applied/duplicate errors.
-- ═══════════════════════════════════════════════════════════════════

-- MySQL requires the full enum list when altering; include all statuses.
ALTER TABLE committee_role_requests
   MODIFY COLUMN status ENUM(
    'REQUESTED',
    'ACCEPTED',
    'REJECTED',
    'CANCELLED',
    'PROMOTED',
    'DEMOTED',
    'REMOVED',
    'REJOINED'
  ) NOT NULL DEFAULT 'REQUESTED';
