-- Migration 058: Ensure users_events has role_id column
-- Purpose: migration 052 adds role_id to users_events, but on databases where the
-- table already existed it may have been skipped. Add it defensively here (consistent
-- with 054 add-won-by / 057 add-role-id-to-event-votes patterns).

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users_events' AND COLUMN_NAME = 'role_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE users_events ADD COLUMN role_id INT NULL, ADD CONSTRAINT fk_users_events_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users_events' AND INDEX_NAME = 'idx_users_events_role_id');
SET @sql_idx = IF(@idx_exists = 0, 'CREATE INDEX idx_users_events_role_id ON users_events(role_id)', 'SELECT 1');
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;
