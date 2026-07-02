-- Migration: Update events table with all required fields
-- Date: 2026-06-29

-- Step 1: Add new columns to events table
ALTER TABLE events ADD COLUMN description LONGTEXT NULL COMMENT 'Event description';
ALTER TABLE events ADD COLUMN event_banner LONGTEXT NULL COMMENT 'Event banner image (base64 or URL)';
ALTER TABLE events ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'UPCOMING' COMMENT 'Event status: UPCOMING, ONGOING, COMPLETED, CANCELLED';
ALTER TABLE events ADD COLUMN type VARCHAR(100) NULL COMMENT 'Event type: puja, sports, meeting, celebration, workshop, other';
ALTER TABLE events ADD COLUMN visibility VARCHAR(50) NOT NULL DEFAULT 'HIDDEN' COMMENT 'Event visibility: VISIBLE, HIDDEN';
ALTER TABLE events ADD COLUMN start_date DATE NULL COMMENT 'Event start date';
ALTER TABLE events ADD COLUMN end_date DATE NULL COMMENT 'Event end date';
ALTER TABLE events ADD COLUMN created_by INT NOT NULL COMMENT 'User ID who created the event';
ALTER TABLE events ADD COLUMN updated_by INT NULL COMMENT 'User ID who last updated the event';

-- Step 2: Add foreign key constraints
ALTER TABLE events ADD CONSTRAINT fk_events_committee FOREIGN KEY (committee_id) REFERENCES committees(committee_id) ON DELETE CASCADE;
ALTER TABLE events ADD CONSTRAINT fk_events_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE events ADD CONSTRAINT fk_events_updated_by FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- Step 3: Create indexes for better query performance
CREATE INDEX idx_events_committee_id ON events(committee_id);
CREATE INDEX idx_events_created_by ON events(created_by);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_visibility ON events(visibility);
CREATE INDEX idx_events_start_date ON events(start_date);


