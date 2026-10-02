-- Event access is controlled by type (PUBLIC/PRIVATE), not a separate visibility column.
ALTER TABLE events DROP INDEX idx_events_visibility;
ALTER TABLE events DROP COLUMN visibility;