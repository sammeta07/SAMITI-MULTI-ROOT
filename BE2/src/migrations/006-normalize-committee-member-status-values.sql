-- Migration: Normalize legacy committee member/admin status values
-- Date: 2026-07-01
-- Purpose: One-time data migration from legacy short status values to ACCEPTED/REJECTED

UPDATE users_committees
SET membership_status = 'ACCEPTED'
WHERE membership_status IS NOT NULL
  AND UPPER(TRIM(membership_status)) = 'ACCEPT';

UPDATE users_committees
SET membership_status = 'REJECTED'
WHERE membership_status IS NOT NULL
  AND UPPER(TRIM(membership_status)) = 'REJECT';

UPDATE users_committees
SET admin_status = 'ACCEPTED'
WHERE admin_status IS NOT NULL
  AND UPPER(TRIM(admin_status)) = 'ACCEPT';

UPDATE users_committees
SET admin_status = 'REJECTED'
WHERE admin_status IS NOT NULL
  AND UPPER(TRIM(admin_status)) = 'REJECT';
