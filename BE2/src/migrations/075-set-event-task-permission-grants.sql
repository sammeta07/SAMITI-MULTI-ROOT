INSERT IGNORE INTO authorization_role_permissions (committee_id, role_id, permission_id)
SELECT c.id, ar.id, ap.id
FROM committees c
CROSS JOIN authorization_roles ar
INNER JOIN authorization_permissions ap
  ON ap.permission_code IN ('event.task.create', 'event.task.update')
WHERE ar.scope = 'COMMITTEE'
  AND ar.role_code = 'COMMITTEE_ADMIN';

DELETE arp
FROM authorization_role_permissions arp
INNER JOIN authorization_roles ar ON ar.id = arp.role_id
INNER JOIN authorization_permissions ap ON ap.id = arp.permission_id
WHERE ar.scope = 'EVENT'
  AND ar.role_code IN ('ADHYAKSHA', 'UPADHYAKSHA')
  AND ap.permission_code IN (
    'event.task.assign_owner',
    'event.task.update',
    'event.task.delete'
  );
