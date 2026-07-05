-- Migration: Add short display name support for events
-- Purpose: Preserve full event name while giving compact UI surfaces a shorter label

ALTER TABLE events
  ADD COLUMN display_name VARCHAR(20) NULL COMMENT 'Short event label for compact UI surfaces' AFTER name;

UPDATE events
SET display_name = LEFT(TRIM(name), 20)
WHERE display_name IS NULL OR TRIM(display_name) = '';
