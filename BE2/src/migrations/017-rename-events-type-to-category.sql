ALTER TABLE events
  CHANGE COLUMN type category VARCHAR(100) NULL COMMENT 'Event category: puja, sports, meeting, celebration, workshop, other';
