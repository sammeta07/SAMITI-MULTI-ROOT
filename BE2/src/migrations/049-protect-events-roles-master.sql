-- Migration 049: Protect events_roles_master table from accidental DELETE
-- Purpose: Ensure event role master data (seed roles) cannot be wiped by migration bugs.

DELIMITER $$
DROP TRIGGER IF EXISTS trg_events_roles_master_block_delete$$
CREATE TRIGGER trg_events_roles_master_block_delete
BEFORE DELETE ON events_roles_master
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot delete rows from events_roles_master. This table is protected.';
END$$
DELIMITER ;

SELECT 'Migration 049 completed. events_roles_master is now protected against DELETE.' AS status;
