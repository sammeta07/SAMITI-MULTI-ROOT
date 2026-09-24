-- Migration 055: Add color column to events_roles_master and assign role colors
-- Purpose: Add a role badge color column for the 4 canonical event roles.
--          (sachiv removal and trigger handling are done in migrations 024/026.)

-- Step 1: Add the color column if it does not yet exist (idempotent).
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events_roles_master' AND COLUMN_NAME = 'color');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE events_roles_master ADD COLUMN color VARCHAR(7) NULL COMMENT ''Role badge hex color e.g. #FFD700''', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Assign distinct colors to the 4 canonical roles.
UPDATE events_roles_master SET color = '#FF00FF' WHERE role_name = 'adhyaksha';
UPDATE events_roles_master SET color = '#800080' WHERE role_name = 'upadhyaksha';
UPDATE events_roles_master SET color = '#ffa500' WHERE role_name = 'koshadhyaksha';
UPDATE events_roles_master SET color = '#000000' WHERE role_name = 'aankshak';

SELECT 'Migration 055 completed. color column added and colors assigned to 4 roles.' AS status;
