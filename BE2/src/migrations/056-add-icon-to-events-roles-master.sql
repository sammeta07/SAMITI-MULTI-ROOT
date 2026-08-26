-- Migration 056: Add icon column to events_roles_master and assign chess-piece icons
-- Purpose: Add an icon column for the 4 canonical roles and assign Unicode chess symbols:
--          adhyaksha → ♔ (king), upadhyaksha → ♕ (wajir/queen),
--          koshadhyaksha → ♖ (rook/castle), aankshak → ♘ (ghods/knight).

-- Step 1: Add the icon column if it does not yet exist (idempotent).
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events_roles_master' AND COLUMN_NAME = 'icon');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE events_roles_master ADD COLUMN icon VARCHAR(10) NULL COMMENT ''Role icon (e.g. Unicode chess piece)''', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Assign chess-piece icons to the 4 canonical roles.
UPDATE events_roles_master SET icon = UNHEX('E29994') WHERE role_name = 'adhyaksha';
UPDATE events_roles_master SET icon = UNHEX('E29995') WHERE role_name = 'upadhyaksha';
UPDATE events_roles_master SET icon = UNHEX('E29996') WHERE role_name = 'koshadhyaksha';
UPDATE events_roles_master SET icon = UNHEX('E29998') WHERE role_name = 'aankshak';

SELECT 'Migration 056 completed. icon column added and chess-piece icons assigned to 4 roles.' AS status;
