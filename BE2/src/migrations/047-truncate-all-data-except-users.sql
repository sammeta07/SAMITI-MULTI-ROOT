SET FOREIGN_KEY_CHECKS = 0;

DROP TRIGGER IF EXISTS trg_users_committees_block_master_admin_delete;
DROP TRIGGER IF EXISTS trg_users_committees_block_master_admin_demotion;

TRUNCATE TABLE event_interest_expressions;
TRUNCATE TABLE event_votes;
TRUNCATE TABLE event_winners;
TRUNCATE TABLE event_voting_roles;
TRUNCATE TABLE event_media_assets;
TRUNCATE TABLE users_events;
TRUNCATE TABLE users_programs;
TRUNCATE TABLE program_media_assets;
TRUNCATE TABLE events;
TRUNCATE TABLE programs;
-- TRUNCATE TABLE events_roles_master; -- PROTECTED: seed data must never be wiped
TRUNCATE TABLE committee_role_requests;
TRUNCATE TABLE users_committees;
TRUNCATE TABLE deleted_events_audit;

SET FOREIGN_KEY_CHECKS = 1;

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

SELECT 'Migration 047 completed. users table preserved.' AS status;
