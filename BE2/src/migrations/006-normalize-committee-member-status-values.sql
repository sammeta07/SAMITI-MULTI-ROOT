-- Migration: Normalize legacy committee member/admin status values
-- Date: 2026-07-01
-- Purpose: One-time data migration from legacy short status values to ACCEPTED/REJECTED

UPDATE committee_members
SET membership_status = 'ACCEPTED'
WHERE membership_status IS NOT NULL
  AND UPPER(TRIM(membership_status)) = CONCAT(CHAR(65), CHAR(67), CHAR(67), CHAR(69), CHAR(80), CHAR(84));

UPDATE committee_members
SET membership_status = 'REJECTED'
WHERE membership_status IS NOT NULL
  AND UPPER(TRIM(membership_status)) = CONCAT(CHAR(82), CHAR(69), CHAR(74), CHAR(69), CHAR(67), CHAR(84));

UPDATE committee_members
SET admin_status = 'ACCEPTED'
WHERE admin_status IS NOT NULL
  AND UPPER(TRIM(admin_status)) = CONCAT(CHAR(65), CHAR(67), CHAR(67), CHAR(69), CHAR(80), CHAR(84));

UPDATE committee_members
SET admin_status = 'REJECTED'
WHERE admin_status IS NOT NULL
  AND UPPER(TRIM(admin_status)) = CONCAT(CHAR(82), CHAR(69), CHAR(74), CHAR(69), CHAR(67), CHAR(84));
