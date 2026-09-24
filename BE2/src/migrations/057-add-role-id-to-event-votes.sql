-- Migration 057: Ensure event_votes has role_id column
-- Purpose: event_votes may have been created by an earlier version of migration 045
-- before role_id was added. CREATE TABLE IF NOT EXISTS skips the existing table, so
-- add the column defensively here (consistent with 054 add-won-by pattern).

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_votes' AND COLUMN_NAME = 'role_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE event_votes ADD COLUMN role_id INT NULL AFTER candidate_id', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @key_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_votes' AND INDEX_NAME = 'uq_event_role_voter');
SET @sql_key = IF(@key_exists = 0, 'ALTER TABLE event_votes ADD UNIQUE KEY uq_event_role_voter (event_id, role_id, voter_id)', 'SELECT 1');
PREPARE stmt_key FROM @sql_key;
EXECUTE stmt_key;
DEALLOCATE PREPARE stmt_key;
