-- Migration 059: Replace persisted event lifecycle status with event year.
-- Event lifecycle remains derived from start_date and end_date.
ALTER TABLE events ADD COLUMN event_year INT NULL AFTER display_name;

UPDATE events
SET event_year = COALESCE(YEAR(start_date), YEAR(created_at), YEAR(CURDATE()))
WHERE event_year IS NULL;

ALTER TABLE events MODIFY COLUMN event_year INT NOT NULL;
ALTER TABLE events DROP INDEX idx_events_status;
ALTER TABLE events DROP COLUMN status;
