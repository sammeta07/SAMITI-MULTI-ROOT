-- ═══════════════════════════════════════════════════════════════════
-- Migration 009: Introduce committee_role_requests table
-- Purpose: Separate request workflow from final membership state
-- 
-- BEFORE dropping columns, backfill runs so no data is lost.
-- Safe to re-run: CREATE IF NOT EXISTS + DROP COLUMN IF EXISTS
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- STEP 1: Create committee_role_requests
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS committee_role_requests (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  committee_id      INT NOT NULL,
  requester_user_id INT NOT NULL,
  request_role      ENUM('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN') NOT NULL,
  status            ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  requested_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  action_by_user_id INT NULL,
  action_at         TIMESTAMP NULL,
  cancel_by_user_id INT NULL,
  cancel_at         TIMESTAMP NULL,
  CONSTRAINT fk_crr_committee  FOREIGN KEY (committee_id)      REFERENCES committees(id) ON DELETE CASCADE,
  CONSTRAINT fk_crr_requester  FOREIGN KEY (requester_user_id) REFERENCES users(id)      ON DELETE CASCADE,
  CONSTRAINT fk_crr_action_by  FOREIGN KEY (action_by_user_id) REFERENCES users(id)      ON DELETE SET NULL,
  CONSTRAINT fk_crr_cancel_by  FOREIGN KEY (cancel_by_user_id) REFERENCES users(id)      ON DELETE SET NULL
);

CREATE INDEX idx_crr_committee_status ON committee_role_requests(committee_id, status);
CREATE INDEX idx_crr_requester_status ON committee_role_requests(requester_user_id, status);
CREATE INDEX idx_crr_role_status      ON committee_role_requests(committee_id, request_role, status);

-- ─────────────────────────────────────────────────────────────────
-- STEP 2: Backfill COMMITTEE_MEMBER requests from users_committees
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO committee_role_requests (
  committee_id, requester_user_id, request_role, status,
  requested_at, action_by_user_id, action_at
)
SELECT
  committee_id,
  user_id,
  'COMMITTEE_MEMBER',
  CASE
    WHEN UPPER(membership_status) IN ('ACCEPTED','REJECTED','PENDING','CANCELLED') THEN UPPER(membership_status)
    ELSE 'ACCEPTED'
  END,
  COALESCE(membership_request_created_at, NOW()),
  membership_status_action_by,
  membership_status_action_at
FROM users_committees
WHERE membership_status IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- STEP 3: Backfill COMMITTEE_ADMIN requests from users_committees
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO committee_role_requests (
  committee_id, requester_user_id, request_role, status,
  requested_at, action_by_user_id, action_at
)
SELECT
  committee_id,
  user_id,
  'COMMITTEE_ADMIN',
  CASE
    WHEN UPPER(admin_status) IN ('ACCEPTED','REJECTED','PENDING','CANCELLED') THEN UPPER(admin_status)
    ELSE 'ACCEPTED'
  END,
  COALESCE(admin_request_created_at, NOW()),
  admin_status_action_by,
  admin_status_action_at
FROM users_committees
WHERE admin_status IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- STEP 4: Clean up users_committees — remove request-workflow columns
-- Only final-state columns remain: is_committee_member, is_committee_admin, is_favourite
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE users_committees
  DROP COLUMN request_type;
ALTER TABLE users_committees
  DROP COLUMN membership_status;
ALTER TABLE users_committees
  DROP COLUMN membership_request_created_at;
ALTER TABLE users_committees
  DROP COLUMN membership_status_action_by;
ALTER TABLE users_committees
  DROP COLUMN membership_status_action_at;
ALTER TABLE users_committees
  DROP COLUMN admin_status;
ALTER TABLE users_committees
  DROP COLUMN admin_request_created_at;
ALTER TABLE users_committees
  DROP COLUMN admin_status_action_by;
ALTER TABLE users_committees
  DROP COLUMN admin_status_action_at;
