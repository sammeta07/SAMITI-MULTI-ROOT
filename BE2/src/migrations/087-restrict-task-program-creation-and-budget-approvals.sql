DELETE arp
FROM authorization_role_permissions arp
INNER JOIN authorization_roles ar ON ar.id = arp.role_id
INNER JOIN authorization_permissions ap ON ap.id = arp.permission_id
WHERE ap.permission_code IN ('event.task.create', 'program.create')
  AND NOT (
    ar.scope = 'COMMITTEE'
    AND ar.role_code IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
  );

INSERT IGNORE INTO authorization_role_permissions (committee_id, role_id, permission_id)
SELECT c.id, ar.id, ap.id
FROM committees c
CROSS JOIN authorization_roles ar
INNER JOIN authorization_permissions ap
  ON ap.permission_code IN ('event.task.create', 'program.create')
WHERE ar.scope = 'COMMITTEE'
  AND ar.role_code = 'COMMITTEE_ADMIN';
