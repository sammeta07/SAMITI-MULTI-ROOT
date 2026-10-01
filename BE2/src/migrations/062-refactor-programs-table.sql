-- Migration: Refactor programs table to support date/time split, recurring, and program images
-- Date: 2026-09-30

-- Add new columns for split date/time and recurring support
ALTER TABLE programs
  ADD COLUMN start_date DATE NULL AFTER visibility,
  ADD COLUMN end_date DATE NULL AFTER start_date,
  ADD COLUMN start_time TIME NULL AFTER end_date,
  ADD COLUMN end_time TIME NULL AFTER start_time,
  ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE AFTER end_time,
  ADD COLUMN program_image VARCHAR(255) NULL AFTER is_recurring;

-- Migrate existing datetime data into new split columns
UPDATE programs
SET
  start_date = DATE(start_date_time),
  end_date = DATE(end_date_time),
  start_time = TIME(start_date_time),
  end_time = TIME(end_date_time),
  is_recurring = FALSE
WHERE start_date_time IS NOT NULL;

-- Make new columns NOT NULL after backfill
ALTER TABLE programs
  MODIFY COLUMN start_date DATE NOT NULL,
  MODIFY COLUMN end_date DATE NOT NULL,
  MODIFY COLUMN start_time TIME NOT NULL,
  MODIFY COLUMN end_time TIME NOT NULL;

-- Drop old datetime columns after migration
ALTER TABLE programs
  DROP COLUMN start_date_time,
  DROP COLUMN end_date_time;
