-- Migration 022: Create events_roles_master
-- Purpose: Central master list of roles that committee admins can pick while configuring event voting roles.

CREATE TABLE IF NOT EXISTS events_roles_master (
  role_id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(100) NOT NULL,
  role_code VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_events_roles_master_role_name UNIQUE (role_name),
  CONSTRAINT uq_events_roles_master_role_code UNIQUE (role_code),
  CONSTRAINT fk_events_roles_master_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_events_roles_master_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_events_roles_master_active_sort ON events_roles_master(is_active, sort_order);

INSERT IGNORE INTO events_roles_master (role_name, role_code, description, is_active, sort_order)
VALUES
  ('ADHYAKSH', 'ADHYAKSH', 'Event chief / president role', 1, 10),
  ('UPADHYAKSH', 'UPADHYAKSH', 'Vice president role', 1, 20),
  ('SECRETARY', 'SECRETARY', 'Event secretary role', 1, 30),
  ('JOINT_SECRETARY', 'JOINT_SECRETARY', 'Joint secretary role', 1, 40),
  ('CASHIER', 'CASHIER', 'Treasurer / cashier role', 1, 50),
  ('ANKA_NIRIKSHAK', 'ANKA_NIRIKSHAK', 'Accounts auditor role', 1, 60),
  ('ORGANIZER', 'ORGANIZER', 'Event organizer role', 1, 70),
  ('CO_ORGANIZER', 'CO_ORGANIZER', 'Co-organizer role', 1, 80),
  ('VOLUNTEER_LEAD', 'VOLUNTEER_LEAD', 'Volunteer lead role', 1, 90),
  ('MEMBER', 'MEMBER', 'General member role', 1, 100);
