-- Migration 037: Enforce that an existing committee can never lose its master admin.
-- Combined with migration 036 (max one master admin), this guarantees exactly one
-- COMMITTEE_MASTER_ADMIN for every committee that has already established one.

DROP TRIGGER IF EXISTS trg_users_committees_block_master_admin_delete;
DROP TRIGGER IF EXISTS trg_users_committees_block_master_admin_demotion;

DELIMITER $$

CREATE TRIGGER trg_users_committees_block_master_admin_delete
BEFORE DELETE ON users_committees
FOR EACH ROW
BEGIN
  IF OLD.committee_role = 'COMMITTEE_MASTER_ADMIN' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot delete COMMITTEE_MASTER_ADMIN. Transfer ownership first.';
  END IF;
END$$

CREATE TRIGGER trg_users_committees_block_master_admin_demotion
BEFORE UPDATE ON users_committees
FOR EACH ROW
BEGIN
  IF OLD.committee_role = 'COMMITTEE_MASTER_ADMIN'
     AND (
       NEW.committee_role <> 'COMMITTEE_MASTER_ADMIN'
       OR NEW.committee_id <> OLD.committee_id
       OR NEW.user_id <> OLD.user_id
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot demote or move COMMITTEE_MASTER_ADMIN. Transfer ownership first.';
  END IF;
END$$

DELIMITER ;
