DELETE arp
FROM authorization_role_permissions arp
INNER JOIN authorization_roles ar ON ar.id = arp.role_id
INNER JOIN authorization_permissions ap ON ap.id = arp.permission_id
WHERE ar.scope = 'COMMITTEE'
  AND ar.role_code = 'COMMITTEE_ADMIN'
  AND ap.permission_code = 'event.task.update';
