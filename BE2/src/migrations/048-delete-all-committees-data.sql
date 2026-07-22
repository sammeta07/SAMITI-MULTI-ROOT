-- Migration 048: Delete all data from committees table
SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM committee_role_requests;
DELETE FROM events;
DELETE FROM committees;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Migration 048 completed: All committees data deleted.' AS status;
