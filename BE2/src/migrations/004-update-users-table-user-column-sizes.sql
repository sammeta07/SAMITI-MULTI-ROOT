-- Migration: Refine users table column sizes
-- Date: 2026-07-01

ALTER TABLE users
  MODIFY COLUMN date_of_birth DATE NOT NULL,
  MODIFY COLUMN gender VARCHAR(15) NOT NULL,
  MODIFY COLUMN mobile VARCHAR(20) NOT NULL;

ALTER TABLE users
  DROP CHECK chk_users_mobile_digits,
  DROP CHECK chk_users_gender,
  DROP CHECK chk_users_email_trimmed;

ALTER TABLE users
  ADD CONSTRAINT chk_users_gender CHECK (gender IN ('male', 'female', 'other')),
  ADD CONSTRAINT chk_users_email_trimmed CHECK (email = LOWER(TRIM(email)));