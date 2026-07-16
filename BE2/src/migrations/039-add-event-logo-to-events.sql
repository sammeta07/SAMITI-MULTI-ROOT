ALTER TABLE events
  ADD COLUMN event_logo VARCHAR(1024) NULL COMMENT 'Event logo image URL' AFTER visibility;
