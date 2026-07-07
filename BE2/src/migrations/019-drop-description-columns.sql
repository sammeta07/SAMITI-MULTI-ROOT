-- Migration: Remove description columns from committees, events, and programs
-- Date: 2026-07-07

ALTER TABLE committees DROP COLUMN description;
ALTER TABLE events DROP COLUMN description;
ALTER TABLE programs DROP COLUMN description;