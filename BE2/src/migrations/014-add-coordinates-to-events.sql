-- Migration: Add latitude/longitude to events table and enforce NOT NULL on committees

-- Step 1: Fix any NULL lat/long in committees (existing records)
UPDATE committees SET latitude = 0 WHERE latitude IS NULL;
UPDATE committees SET longitude = 0 WHERE longitude IS NULL;

-- Step 2: Make committees lat/long NOT NULL with DEFAULT 0
ALTER TABLE committees
  MODIFY COLUMN latitude  DOUBLE NOT NULL DEFAULT 0,
  MODIFY COLUMN longitude DOUBLE NOT NULL DEFAULT 0;

-- Step 3: Add latitude/longitude to events table (DEFAULT 0 so existing rows are not broken)
ALTER TABLE events
  ADD COLUMN latitude  DOUBLE NOT NULL DEFAULT 0 AFTER end_date,
  ADD COLUMN longitude DOUBLE NOT NULL DEFAULT 0 AFTER latitude;
