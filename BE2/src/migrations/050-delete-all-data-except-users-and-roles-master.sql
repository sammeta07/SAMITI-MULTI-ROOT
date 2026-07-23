-- Migration: Delete all data except users and events_roles_master tables
-- Purpose: Reset database for testing while preserving user accounts and role master data

SET FOREIGN_KEY_CHECKS = 0;

-- Truncate all tables except users and events_roles_master
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
TRUNCATE TABLE committee_role_requests;
TRUNCATE TABLE users_committees;
TRUNCATE TABLE deleted_events_audit;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'All data deleted except users and events_roles_master tables.' AS status;
