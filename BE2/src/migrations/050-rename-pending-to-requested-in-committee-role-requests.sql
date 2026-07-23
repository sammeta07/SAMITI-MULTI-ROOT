-- ═══════════════════════════════════════════════════════════════════
-- Migration 050: Rename PENDING status to REQUESTED in committee_role_requests
-- Purpose: Existing rows with status='PENDING' are migrated to 'REQUESTED'
--          to match the updated enum and application logic.
-- ═══════════════════════════════════════════════════════════════════

UPDATE committee_role_requests
SET status = 'REQUESTED'
WHERE status = 'PENDING';
