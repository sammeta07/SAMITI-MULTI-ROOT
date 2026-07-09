-- Migration 036: Enforce a single COMMITTEE_MASTER_ADMIN per committee (at most one)
-- Functional unique index strategy:
-- - master-admin rows map to committee_id
-- - non-master rows map to NULL (multiple NULLs allowed)

CREATE UNIQUE INDEX uq_users_committees_one_master_admin
  ON users_committees ((CASE WHEN committee_role = 'COMMITTEE_MASTER_ADMIN' THEN committee_id ELSE NULL END));
