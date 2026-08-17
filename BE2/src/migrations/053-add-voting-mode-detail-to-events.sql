SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME = 'voting_mode_detail');
SET @sql_drop = IF(@col_exists > 0, 'ALTER TABLE events DROP COLUMN voting_mode_detail', 'SELECT 1');
PREPARE stmt_drop FROM @sql_drop;
EXECUTE stmt_drop;
DEALLOCATE PREPARE stmt_drop;

UPDATE events SET voting_mode = 'DIRECT' WHERE voting_mode = 'DIRECT_ASSIGN';
ALTER TABLE events MODIFY COLUMN voting_mode ENUM('VOTING', 'DIRECT') NOT NULL DEFAULT 'VOTING';
