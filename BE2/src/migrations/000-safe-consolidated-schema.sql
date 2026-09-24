-- Consolidated schema migration.
-- Safety contract: this file never drops, truncates, or deletes a table/row.
-- It creates missing objects only. Existing tables and data are preserved.

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender VARCHAR(15) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  base_role VARCHAR(50) NOT NULL DEFAULT 'AUTH_USER',
  profile_photo VARCHAR(255) DEFAULT NULL,
  fcm_token VARCHAR(255) DEFAULT NULL,
  provider VARCHAR(50) DEFAULT NULL,
  provider_id VARCHAR(255) DEFAULT NULL,
  status ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  email_verified_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_mobile (mobile),
  KEY idx_social_provider (provider, provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS committees (
  id INT NOT NULL AUTO_INCREMENT,
  committee_name VARCHAR(255) NOT NULL,
  establish_year INT NULL,
  address VARCHAR(500) NOT NULL,
  district_id INT NULL,
  state_id INT NULL,
  latitude DOUBLE NOT NULL DEFAULT 0,
  longitude DOUBLE NOT NULL DEFAULT 0,
  contact_numbers JSON NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logo VARCHAR(1024) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY fk_committees_created_by (created_by),
  CONSTRAINT fk_committees_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events_roles_master (
  role_id INT NOT NULL AUTO_INCREMENT,
  hindi_name VARCHAR(100) DEFAULT NULL,
  english_name VARCHAR(100) DEFAULT NULL,
  role_name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by INT DEFAULT NULL,
  updated_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  color VARCHAR(7) DEFAULT NULL,
  icon VARCHAR(10) DEFAULT NULL,
  PRIMARY KEY (role_id),
  UNIQUE KEY uq_events_roles_master_role_name (role_name),
  UNIQUE KEY uq_events_roles_master_hindi_name (hindi_name),
  UNIQUE KEY uq_events_roles_master_english_name (english_name),
  KEY fk_events_roles_master_created_by (created_by),
  KEY fk_events_roles_master_updated_by (updated_by),
  CONSTRAINT fk_events_roles_master_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_events_roles_master_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id INT NOT NULL AUTO_INCREMENT,
  committee_id INT DEFAULT NULL,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(20) DEFAULT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'UPCOMING',
  category VARCHAR(100) DEFAULT NULL,
  type ENUM('PUBLIC','PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  visibility VARCHAR(50) NOT NULL DEFAULT 'HIDDEN',
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  latitude DOUBLE NOT NULL DEFAULT 0,
  longitude DOUBLE NOT NULL DEFAULT 0,
  address VARCHAR(255) DEFAULT NULL,
  created_by INT NOT NULL,
  updated_by INT DEFAULT NULL,
  event_logo VARCHAR(1024) DEFAULT NULL,
  voting_enabled TINYINT(1) NOT NULL DEFAULT 0,
  voting_closed TINYINT(1) NOT NULL DEFAULT 0,
  voting_phase_state TINYINT(1) NOT NULL DEFAULT 0,
  voting_mode ENUM('VOTING','DIRECT') NOT NULL DEFAULT 'VOTING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_committee_id (committee_id),
  KEY idx_events_created_by (created_by),
  KEY idx_events_status (status),
  KEY idx_events_visibility (visibility),
  KEY idx_events_start_date (start_date),
  KEY fk_events_updated_by (updated_by),
  CONSTRAINT fk_events_committee FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_events_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS programs (
  id INT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  start_date_time DATETIME NOT NULL,
  end_date_time DATETIME NOT NULL,
  address VARCHAR(255) DEFAULT NULL,
  status VARCHAR(50) NOT NULL,
  visibility VARCHAR(50) NOT NULL DEFAULT 'VISIBLE',
  created_by INT NOT NULL,
  updated_by INT NOT NULL,
  type VARCHAR(100) DEFAULT NULL,
  latitude DECIMAL(10,8) DEFAULT NULL,
  longitude DECIMAL(11,8) DEFAULT NULL,
  photos JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY event_id (event_id),
  KEY fk_programs_created_by (created_by),
  KEY fk_programs_updated_by (updated_by),
  CONSTRAINT fk_programs_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_programs_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_programs_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users_committees (
  id INT NOT NULL AUTO_INCREMENT,
  committee_id INT NOT NULL,
  user_id INT NOT NULL,
  committee_role ENUM('COMMITTEE_MEMBER','COMMITTEE_ADMIN','COMMITTEE_MASTER_ADMIN') DEFAULT NULL,
  is_favourite TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_committees_committee_user (committee_id, user_id),
  KEY user_id (user_id),
  KEY idx_users_committees_committee_role (committee_id, committee_role),
  CONSTRAINT fk_uc_committee FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
  CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users_events (
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  designation VARCHAR(50) DEFAULT NULL,
  status VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  role_id INT DEFAULT NULL,
  PRIMARY KEY (event_id, user_id),
  KEY idx_users_events_user_id (user_id),
  KEY idx_users_events_event_status (event_id, status),
  KEY idx_users_events_role_id (role_id),
  CONSTRAINT fk_users_events_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_events_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @users_events_role_id_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users_events' AND COLUMN_NAME = 'role_id'
);
SET @sql = IF(
  @users_events_role_id_exists = 0,
  'ALTER TABLE users_events ADD COLUMN role_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @users_events_role_key_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users_events' AND INDEX_NAME = 'idx_users_events_role_id'
);
SET @sql = IF(
  @users_events_role_key_exists = 0,
  'CREATE INDEX idx_users_events_role_id ON users_events(role_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @users_events_role_fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'users_events' AND CONSTRAINT_NAME = 'fk_users_events_role'
);
SET @sql = IF(
  @users_events_role_fk_exists = 0,
  'ALTER TABLE users_events ADD CONSTRAINT fk_users_events_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS users_programs (
  program_id INT NOT NULL,
  user_id INT NOT NULL,
  designation VARCHAR(50) DEFAULT NULL,
  status VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (program_id, user_id),
  KEY idx_users_programs_user_id (user_id),
  KEY idx_users_programs_program_status (program_id, status),
  CONSTRAINT fk_users_programs_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_programs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_media_assets (
  id INT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  media_url LONGTEXT NOT NULL,
  media_type VARCHAR(50) NOT NULL DEFAULT 'BANNER',
  sort_order INT NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_event_media_assets_event_id (event_id),
  KEY idx_event_media_assets_sort_order (sort_order),
  CONSTRAINT fk_event_media_assets_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_media_assets_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS program_media_assets (
  id INT NOT NULL AUTO_INCREMENT,
  program_id INT NOT NULL,
  media_url LONGTEXT NOT NULL,
  media_type VARCHAR(50) NOT NULL DEFAULT 'BANNER',
  sort_order INT NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_program_media_assets_program_id (program_id),
  KEY idx_program_media_assets_sort_order (sort_order),
  CONSTRAINT fk_program_media_assets_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_program_media_assets_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id INT NOT NULL AUTO_INCREMENT,
  event_id INT DEFAULT NULL,
  parent_id INT DEFAULT NULL,
  name VARCHAR(255) DEFAULT NULL,
  title VARCHAR(255) DEFAULT NULL,
  owner_id INT DEFAULT NULL,
  status VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_event_id (event_id),
  KEY idx_tasks_parent_id (parent_id),
  KEY idx_tasks_owner_id (owner_id),
  CONSTRAINT fk_tasks_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_parent FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS committee_role_requests (
  id INT NOT NULL AUTO_INCREMENT,
  committee_id INT NOT NULL,
  requester_user_id INT NOT NULL,
  request_role ENUM('COMMITTEE_MEMBER','COMMITTEE_ADMIN') NOT NULL,
  status ENUM('PENDING','ACCEPTED','REJECTED','CANCELLED','PROMOTED','DEMOTED','REMOVED','REJOINED') NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  action_by_user_id INT DEFAULT NULL,
  action_at TIMESTAMP NULL DEFAULT NULL,
  cancel_by_user_id INT DEFAULT NULL,
  cancel_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_crr_committee_status (committee_id, status),
  KEY idx_crr_requester_status (requester_user_id, status),
  CONSTRAINT fk_crr_committee FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
  CONSTRAINT fk_crr_requester FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_crr_action_by FOREIGN KEY (action_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_crr_cancel_by FOREIGN KEY (cancel_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_voting_roles (
  event_id INT NOT NULL,
  role_id INT NOT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, role_id),
  KEY idx_event_voting_roles_role_id (role_id),
  CONSTRAINT fk_event_voting_roles_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_voting_roles_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_event_voting_roles_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_interest_expressions (
  id INT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  role_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by INT DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_role_user (event_id, role_id, user_id),
  CONSTRAINT fk_event_interest_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_interest_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_event_interest_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_interest_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_votes (
  id INT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  role_id INT NOT NULL,
  voter_id INT NOT NULL,
  candidate_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_role_voter (event_id, role_id, voter_id),
  KEY idx_event_vote_event (event_id),
  CONSTRAINT fk_event_vote_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_vote_role FOREIGN KEY (role_id) REFERENCES events_roles_master(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_event_vote_voter FOREIGN KEY (voter_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_vote_candidate FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_winners (
  id INT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  role_id INT NOT NULL,
  winner_user_id INT NOT NULL,
  winner_name VARCHAR(255) NOT NULL,
  winner_photo VARCHAR(255) DEFAULT NULL,
  winner_vote_count INT NOT NULL DEFAULT 0,
  declared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  won_by VARCHAR(32) NOT NULL DEFAULT 'COUNT',
  PRIMARY KEY (id),
  UNIQUE KEY uk_event_role (event_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS deleted_events_audit (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  committee_id INT DEFAULT NULL,
  deleted_by INT NOT NULL,
  deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_snapshot LONGTEXT,
  PRIMARY KEY (id),
  KEY idx_deleted_events_audit_event_id (event_id),
  CONSTRAINT fk_deleted_events_audit_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE OR REPLACE VIEW event_members AS
SELECT event_id, user_id, designation, status, created_at, updated_at FROM users_events;

DELIMITER $$
CREATE TRIGGER trg_events_roles_master_block_delete
BEFORE DELETE ON events_roles_master
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Cannot delete rows from events_roles_master. This table is protected.';
END$$
DELIMITER ;
