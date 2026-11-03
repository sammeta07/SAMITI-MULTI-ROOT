CREATE TABLE IF NOT EXISTS authorization_roles (
  id INT NOT NULL AUTO_INCREMENT,
  scope ENUM('COMMITTEE', 'EVENT') NOT NULL,
  role_code VARCHAR(100) NOT NULL,
  display_name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_authorization_roles_scope_code (scope, role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS authorization_permissions (
  id INT NOT NULL AUTO_INCREMENT,
  permission_code VARCHAR(150) NOT NULL,
  module VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_authorization_permissions_code (permission_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS authorization_role_permissions (
  committee_id INT NOT NULL,
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (committee_id, role_id, permission_id),
  KEY idx_authorization_role_permissions_role (role_id, committee_id),
  CONSTRAINT fk_authorization_role_permissions_committee
    FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
  CONSTRAINT fk_authorization_role_permissions_role
    FOREIGN KEY (role_id) REFERENCES authorization_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_authorization_role_permissions_permission
    FOREIGN KEY (permission_id) REFERENCES authorization_permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS authorization_user_roles (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  scope ENUM('COMMITTEE', 'EVENT') NOT NULL,
  scope_id INT NOT NULL,
  assigned_by INT NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_authorization_user_roles_assignment (user_id, role_id, scope, scope_id),
  KEY idx_authorization_user_roles_scope (scope, scope_id, user_id),
  CONSTRAINT fk_authorization_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_authorization_user_roles_role
    FOREIGN KEY (role_id) REFERENCES authorization_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_authorization_user_roles_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO authorization_roles (scope, role_code, display_name)
VALUES
  ('COMMITTEE', 'COMMITTEE_MEMBER', 'Committee Member'),
  ('COMMITTEE', 'COMMITTEE_ADMIN', 'Committee Admin'),
  ('COMMITTEE', 'COMMITTEE_MASTER_ADMIN', 'Committee Master Admin')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

INSERT INTO authorization_roles (scope, role_code, display_name)
SELECT DISTINCT
  'EVENT',
  UPPER(REPLACE(REPLACE(TRIM(role_name), ' ', '_'), '-', '_')),
  COALESCE(NULLIF(TRIM(english_name), ''), role_name)
FROM events_roles_master
WHERE TRIM(COALESCE(role_name, '')) <> ''
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

INSERT INTO authorization_permissions (permission_code, module, action, description)
VALUES
  ('event.task.create', 'event.task', 'create', 'Create event-level tasks'),
  ('event.task.assign_owner', 'event.task', 'assign_owner', 'Assign owners to event tasks'),
  ('event.task.update', 'event.task', 'update', 'Update root event tasks'),
  ('event.task.delete', 'event.task', 'delete', 'Delete root event tasks'),
  ('event.task.manage_any', 'event.task', 'manage_any', 'Manage any task independent of ownership'),
  ('program.create', 'program', 'create', 'Create programs'),
  ('program.update', 'program', 'update', 'Update programs'),
  ('program.delete', 'program', 'delete', 'Delete root programs'),
  ('program.assign_owner', 'program', 'assign_owner', 'Assign program owners'),
  ('program.manage_banners', 'program', 'manage_banners', 'Manage program banner images'),
  ('program.manage_any', 'program', 'manage_any', 'Manage any program independent of ownership'),
  ('todo.manage', 'todo', 'manage', 'Manage task and program checklist items'),
  ('committee.profile.update', 'committee', 'profile.update', 'Update committee profile'),
  ('committee.logo.update', 'committee', 'logo.update', 'Update committee logo'),
  ('committee.members.manage', 'committee', 'members.manage', 'Manage committee members'),
  ('committee.admins.manage', 'committee', 'admins.manage', 'Promote or demote committee admins'),
  ('committee.requests.review', 'committee', 'requests.review', 'Review committee membership requests'),
  ('event.create', 'event', 'create', 'Create committee events'),
  ('event.update', 'event', 'update', 'Update committee events'),
  ('event.delete', 'event', 'delete', 'Delete committee events'),
  ('event.manage_banners', 'event', 'manage_banners', 'Manage event banner images'),
  ('event.voting.configure', 'event', 'voting.configure', 'Configure event voting mode'),
  ('event.voting.manage', 'event', 'voting.manage', 'Manage event voting phases and results'),
  ('event.interest.review', 'event', 'interest.review', 'Review event interest expressions'),
  ('authorization.manage', 'authorization', 'manage', 'Configure role permission grants')
ON DUPLICATE KEY UPDATE
  module = VALUES(module),
  action = VALUES(action),
  description = VALUES(description);

INSERT IGNORE INTO authorization_role_permissions (committee_id, role_id, permission_id)
SELECT c.id, ar.id, ap.id
FROM committees c
CROSS JOIN authorization_roles ar
CROSS JOIN authorization_permissions ap
WHERE ar.scope = 'COMMITTEE' AND ar.role_code = 'COMMITTEE_MASTER_ADMIN';

INSERT IGNORE INTO authorization_role_permissions (committee_id, role_id, permission_id)
SELECT c.id, ar.id, ap.id
FROM committees c
INNER JOIN authorization_roles ar ON ar.scope = 'EVENT'
INNER JOIN authorization_permissions ap
  ON ap.permission_code IN (
    'event.task.create',
    'event.task.assign_owner',
    'event.task.update',
    'event.task.delete',
    'program.create',
    'program.update',
    'program.delete',
    'program.assign_owner',
    'program.manage_banners'
  )
WHERE ar.role_code IN ('ADHYAKSHA', 'UPADHYAKSHA');

INSERT IGNORE INTO authorization_role_permissions (committee_id, role_id, permission_id)
SELECT c.id, ar.id, ap.id
FROM committees c
CROSS JOIN authorization_roles ar
INNER JOIN authorization_permissions ap
  ON ap.permission_code IN (
    'committee.profile.update',
    'committee.logo.update',
    'committee.members.manage',
    'committee.requests.review',
    'event.create',
    'event.update',
    'event.delete',
    'event.manage_banners',
    'event.voting.configure'
  )
WHERE ar.scope = 'COMMITTEE' AND ar.role_code = 'COMMITTEE_ADMIN';
