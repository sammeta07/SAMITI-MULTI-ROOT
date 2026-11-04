import { execute, query } from '../config/db';

export const PERMISSIONS = {
  EVENT_TASK_CREATE: 'event.task.create',
  EVENT_TASK_ASSIGN_OWNER: 'event.task.assign_owner',
  EVENT_TASK_UPDATE: 'event.task.update',
  EVENT_TASK_DELETE: 'event.task.delete',
  EVENT_TASK_MANAGE_ANY: 'event.task.manage_any',
  PROGRAM_CREATE: 'program.create',
  PROGRAM_UPDATE: 'program.update',
  PROGRAM_DELETE: 'program.delete',
  PROGRAM_ASSIGN_OWNER: 'program.assign_owner',
  PROGRAM_MANAGE_BANNERS: 'program.manage_banners',
  PROGRAM_MANAGE_ANY: 'program.manage_any',
  TODO_MANAGE: 'todo.manage',
  COMMITTEE_PROFILE_UPDATE: 'committee.profile.update',
  COMMITTEE_LOGO_UPDATE: 'committee.logo.update',
  COMMITTEE_MEMBERS_MANAGE: 'committee.members.manage',
  COMMITTEE_ADMINS_MANAGE: 'committee.admins.manage',
  COMMITTEE_REQUESTS_REVIEW: 'committee.requests.review',
  EVENT_CREATE: 'event.create',
  EVENT_UPDATE: 'event.update',
  EVENT_DELETE: 'event.delete',
  EVENT_MANAGE_BANNERS: 'event.manage_banners',
  EVENT_VOTING_CONFIGURE: 'event.voting.configure',
  EVENT_VOTING_MANAGE: 'event.voting.manage',
  EVENT_INTEREST_REVIEW: 'event.interest.review',
  AUTHORIZATION_MANAGE: 'authorization.manage'
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export type AuthorizationScope =
  | { type: 'COMMITTEE'; id: number }
  | { type: 'EVENT'; id: number };

export async function hasPermission(
  userId: number,
  permissionCode: PermissionCode,
  scope: AuthorizationScope
): Promise<boolean> {
  const rows = scope.type === 'COMMITTEE'
    ? await query<any[]>(
      `SELECT EXISTS (
         SELECT 1
         FROM users_committees uc
         INNER JOIN authorization_roles ar
           ON ar.scope = 'COMMITTEE'
         LEFT JOIN authorization_user_roles aur
           ON aur.role_id = ar.id
          AND aur.user_id = uc.user_id
          AND aur.scope = 'COMMITTEE'
          AND aur.scope_id = uc.committee_id
         INNER JOIN authorization_role_permissions arp
           ON arp.role_id = ar.id AND arp.committee_id = uc.committee_id
         INNER JOIN authorization_permissions ap ON ap.id = arp.permission_id
         WHERE uc.committee_id = ? AND uc.user_id = ?
           AND (ar.role_code = uc.committee_role OR aur.role_id IS NOT NULL)
           AND ap.permission_code = ?
       ) AS granted`,
      [scope.id, userId, permissionCode]
    )
    : await query<any[]>(
      `SELECT EXISTS (
         SELECT 1
         FROM events e
         LEFT JOIN users_committees uc
           ON uc.committee_id = e.committee_id AND uc.user_id = ?
         LEFT JOIN users_events ue
           ON ue.event_id = e.id AND ue.user_id = ?
         LEFT JOIN events_roles_master erm ON erm.role_id = ue.role_id
         LEFT JOIN authorization_user_roles aur
           ON aur.user_id = ?
          AND (
            (aur.scope = 'COMMITTEE' AND aur.scope_id = e.committee_id)
            OR (aur.scope = 'EVENT' AND aur.scope_id = e.id)
          )
         INNER JOIN authorization_roles ar
           ON (aur.role_id = ar.id AND aur.scope = ar.scope)
           OR (ar.scope = 'COMMITTEE' AND ar.role_code = uc.committee_role)
           OR (
             ar.scope = 'EVENT'
             AND ar.role_code = UPPER(REPLACE(REPLACE(TRIM(COALESCE(erm.role_name, ue.designation)), ' ', '_'), '-', '_'))
           )
         INNER JOIN authorization_role_permissions arp
           ON arp.role_id = ar.id AND arp.committee_id = e.committee_id
         INNER JOIN authorization_permissions ap ON ap.id = arp.permission_id
         WHERE e.id = ? AND ap.permission_code = ?
       ) AS granted`,
      [userId, userId, userId, scope.id, permissionCode]
    );

  return Number(rows[0]?.granted) === 1;
}

export async function getAuthorizedCommitteeIds(
  userId: number,
  permissionCode: PermissionCode,
  committeeIds: number[]
): Promise<Set<number>> {
  const uniqueCommitteeIds = [...new Set(committeeIds.map(Number))]
    .filter((committeeId) => Number.isInteger(committeeId) && committeeId > 0);
  const results = await Promise.all(uniqueCommitteeIds.map(async (committeeId) => ({
    committeeId,
    allowed: await hasPermission(userId, permissionCode, { type: 'COMMITTEE', id: committeeId })
  })));
  return new Set(results.filter((result) => result.allowed).map((result) => result.committeeId));
}

export async function initializeCommitteePermissions(committeeId: number): Promise<void> {
  await execute(
    `INSERT IGNORE INTO authorization_role_permissions (committee_id, role_id, permission_id)
     SELECT ?, ar.id, ap.id
     FROM authorization_roles ar
     CROSS JOIN authorization_permissions ap
     WHERE ar.scope = 'COMMITTEE' AND ar.role_code = 'COMMITTEE_MASTER_ADMIN'`,
    [committeeId]
  );
  await execute(
    `INSERT IGNORE INTO authorization_role_permissions (committee_id, role_id, permission_id)
     SELECT ?, ar.id, ap.id
     FROM authorization_roles ar
     INNER JOIN authorization_permissions ap
       ON ap.permission_code IN (
         'event.task.create',
         'program.create',
         'program.update',
         'program.delete',
         'program.assign_owner',
         'program.manage_banners'
       )
     WHERE ar.scope = 'EVENT' AND ar.role_code IN ('ADHYAKSHA', 'UPADHYAKSHA')`,
    [committeeId]
  );
  await execute(
    `INSERT IGNORE INTO authorization_role_permissions (committee_id, role_id, permission_id)
     SELECT ?, ar.id, ap.id
     FROM authorization_roles ar
     INNER JOIN authorization_permissions ap
       ON ap.permission_code = 'event.task.create'
     WHERE ar.scope = 'COMMITTEE' AND ar.role_code = 'COMMITTEE_ADMIN'`,
    [committeeId]
  );
  await execute(
    `INSERT IGNORE INTO authorization_role_permissions (committee_id, role_id, permission_id)
     SELECT ?, ar.id, ap.id
     FROM authorization_roles ar
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
     WHERE ar.scope = 'COMMITTEE' AND ar.role_code = 'COMMITTEE_ADMIN'`,
    [committeeId]
  );
}
