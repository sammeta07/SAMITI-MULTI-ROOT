import { getConnection } from '../../config/db';
import { getLoggedInUserId, throwEventError } from '../events/details/voting/event-voting-core.graphql';
import { hasPermission, PERMISSIONS } from '../../authorization/authorization';

export const rolePermissionsTypes = `
  type AuthorizationRole {
    scope: String!
    roleCode: String!
    displayName: String!
    permissionCodes: [String!]!
  }

  type AuthorizationPermission {
    permissionCode: String!
    module: String!
    action: String!
    description: String!
  }

  type AuthorizationRoleAssignment {
    userId: Int!
    userName: String!
    roleCode: String!
    displayName: String!
    scope: String!
    scopeId: Int!
  }
`;

export const rolePermissionsQueryFields = `
  authorizationRoles(committeeId: Int!): [AuthorizationRole!]!
  authorizationPermissions(committeeId: Int!): [AuthorizationPermission!]!
  authorizationRoleAssignments(committeeId: Int!, scope: String!, scopeId: Int!): [AuthorizationRoleAssignment!]!
`;

export const rolePermissionsMutationFields = `
  setRolePermissions(
    committeeId: Int!
    scope: String!
    roleCode: String!
    displayName: String!
    permissionCodes: [String!]!
  ): Boolean!
  assignAuthorizationRole(committeeId: Int!, userId: Int!, scope: String!, scopeId: Int!, roleCode: String!): Boolean!
  revokeAuthorizationRole(committeeId: Int!, userId: Int!, scope: String!, scopeId: Int!, roleCode: String!): Boolean!
`;

async function assertCanManageAuthorization(userId: number, committeeId: number): Promise<void> {
  if (!Number.isInteger(committeeId) || committeeId <= 0) {
    throwEventError('BAD_REQUEST', 'committeeId must be a positive integer');
  }
  if (!await hasPermission(
    userId,
    PERMISSIONS.AUTHORIZATION_MANAGE,
    { type: 'COMMITTEE', id: committeeId }
  )) {
    throwEventError('FORBIDDEN', 'Only a committee master admin can manage role permissions');
  }
}

export const rolePermissionsResolvers = {
  Query: {
    async authorizationRoles(_: any, args: { committeeId: number }, context: any) {
      const userId = await getLoggedInUserId(context);
      const committeeId = Number(args?.committeeId);
      await assertCanManageAuthorization(userId, committeeId);

      const connection = await getConnection();
      try {
        const [rows] = await connection.query<any[]>(
          `SELECT ar.scope, ar.role_code AS roleCode, ar.display_name AS displayName,
                  ap.permission_code AS permissionCode
           FROM authorization_roles ar
           LEFT JOIN authorization_role_permissions arp
             ON arp.role_id = ar.id AND arp.committee_id = ?
           LEFT JOIN authorization_permissions ap ON ap.id = arp.permission_id
           ORDER BY ar.scope, ar.display_name, ap.permission_code`,
          [committeeId]
        );
        const roles = new Map<string, {
          scope: string;
          roleCode: string;
          displayName: string;
          permissionCodes: string[];
        }>();
        for (const row of rows) {
          const roleCode = String(row.roleCode);
          const scope = String(row.scope);
          const key = `${scope}:${roleCode}`;
          const role = roles.get(key) ?? {
            scope,
            roleCode,
            displayName: String(row.displayName),
            permissionCodes: []
          };
          if (row.permissionCode) role.permissionCodes.push(String(row.permissionCode));
          roles.set(key, role);
        }
        return [...roles.values()];
      } finally {
        connection.release();
      }
    },

    async authorizationPermissions(_: any, args: { committeeId: number }, context: any) {
      const userId = await getLoggedInUserId(context);
      await assertCanManageAuthorization(userId, Number(args?.committeeId));
      const connection = await getConnection();
      try {
        const [rows] = await connection.query<any[]>(
          `SELECT DISTINCT ap.permission_code AS permissionCode, ap.module, ap.action, ap.description
           FROM authorization_permissions ap
           INNER JOIN authorization_role_permissions arp ON arp.permission_id = ap.id
           WHERE arp.committee_id = ?
           ORDER BY ap.module, ap.action, ap.permission_code`,
          [Number(args?.committeeId)]
        );
        return rows;
      } finally {
        connection.release();
      }
    },

    async authorizationRoleAssignments(
      _: any,
      args: { committeeId: number; scope: string; scopeId: number },
      context: any
    ) {
      const userId = await getLoggedInUserId(context);
      const committeeId = Number(args?.committeeId);
      await assertCanManageAuthorization(userId, committeeId);
      const scope = String(args?.scope || '').trim().toUpperCase();
      const scopeId = Number(args?.scopeId);
      if (scope !== 'COMMITTEE' && scope !== 'EVENT') {
        throwEventError('BAD_REQUEST', 'scope must be COMMITTEE or EVENT');
      }
      if (!Number.isInteger(scopeId) || scopeId <= 0 ||
        (scope === 'COMMITTEE' && scopeId !== committeeId)) {
        throwEventError('BAD_REQUEST', 'scopeId is invalid for the selected scope');
      }

      const connection = await getConnection();
      try {
        if (scope === 'EVENT') {
          const [eventRows] = await connection.execute<any[]>(
            `SELECT id FROM events WHERE id = ? AND committee_id = ? LIMIT 1`,
            [scopeId, committeeId]
          );
          if (eventRows.length === 0) {
            throwEventError('NOT_FOUND', 'Event not found in this committee');
          }
        }
        const [rows] = await connection.execute<any[]>(
          `SELECT aur.user_id AS userId, u.name AS userName,
                  ar.role_code AS roleCode, ar.display_name AS displayName,
                  aur.scope, aur.scope_id AS scopeId
           FROM authorization_user_roles aur
           INNER JOIN authorization_roles ar ON ar.id = aur.role_id AND ar.scope = aur.scope
           INNER JOIN users u ON u.id = aur.user_id
           WHERE aur.scope = ? AND aur.scope_id = ?
           ORDER BY u.name, ar.display_name`,
          [scope, scopeId]
        );
        return rows;
      } finally {
        connection.release();
      }
    }
  },
  Mutation: {
    async setRolePermissions(
      _: any,
      args: {
        committeeId: number;
        scope: string;
        roleCode: string;
        displayName: string;
        permissionCodes: string[];
      },
      context: any
    ) {
      const userId = await getLoggedInUserId(context);
      await assertCanManageAuthorization(userId, Number(args?.committeeId));
      const scope = String(args?.scope || '').trim().toUpperCase();
      const roleCode = String(args?.roleCode || '').trim().toUpperCase();
      const displayName = String(args?.displayName || '').trim();
      const permissionCodes = args?.permissionCodes;

      if (scope !== 'COMMITTEE' && scope !== 'EVENT') {
        throwEventError('BAD_REQUEST', 'scope must be COMMITTEE or EVENT');
      }
      if (!/^[A-Z0-9_]{2,100}$/.test(roleCode)) {
        throwEventError('BAD_REQUEST', 'roleCode must contain 2 to 100 letters, digits, or underscores');
      }
      if (scope === 'COMMITTEE' && roleCode === 'COMMITTEE_MASTER_ADMIN') {
        throwEventError('FORBIDDEN', 'The master admin role permissions are managed by system migrations');
      }
      if (!displayName || displayName.length > 150) {
        throwEventError('BAD_REQUEST', 'displayName must contain 1 to 150 characters');
      }
      if (!Array.isArray(permissionCodes) || permissionCodes.some((code) => typeof code !== 'string')) {
        throwEventError('BAD_REQUEST', 'permissionCodes must be a list of permission codes');
      }
      const normalizedPermissionCodes = [...new Set(permissionCodes.map((code) => code.trim()))];
      if (normalizedPermissionCodes.includes(PERMISSIONS.AUTHORIZATION_MANAGE)) {
        throwEventError('FORBIDDEN', 'The authorization management permission is reserved for committee master admins');
      }

      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [roleResult] = await connection.execute<any>(
          `INSERT INTO authorization_roles (scope, role_code, display_name)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
          [scope, roleCode, displayName]
        );
        void roleResult;
        const [roleRows] = await connection.execute<any[]>(
          `SELECT id FROM authorization_roles WHERE scope = ? AND role_code = ? LIMIT 1`,
          [scope, roleCode]
        );
        if (roleRows.length === 0) {
          throwEventError('INTERNAL_SERVER_ERROR', 'Could not save authorization role');
        }

        const roleId = Number(roleRows[0].id);
        let permissionRows: any[] = [];
        if (normalizedPermissionCodes.length > 0) {
          const placeholders = normalizedPermissionCodes.map(() => '?').join(', ');
          const [rows] = await connection.execute<any[]>(
            `SELECT id, permission_code AS permissionCode
             FROM authorization_permissions
             WHERE permission_code IN (${placeholders})`,
            normalizedPermissionCodes
          );
          permissionRows = rows;
          if (permissionRows.length !== normalizedPermissionCodes.length) {
            throwEventError('BAD_REQUEST', 'One or more permission codes are not registered');
          }
        }

        await connection.execute(
          `DELETE FROM authorization_role_permissions WHERE committee_id = ? AND role_id = ?`,
          [Number(args.committeeId), roleId]
        );
        for (const permission of permissionRows) {
          await connection.execute(
            `INSERT INTO authorization_role_permissions (committee_id, role_id, permission_id)
             VALUES (?, ?, ?)`,
            [Number(args.committeeId), roleId, Number(permission.id)]
          );
        }
        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async assignAuthorizationRole(
      _: any,
      args: { committeeId: number; userId: number; scope: string; scopeId: number; roleCode: string },
      context: any
    ) {
      return updateAuthorizationRoleAssignment(args, context, false);
    },
    async revokeAuthorizationRole(
      _: any,
      args: { committeeId: number; userId: number; scope: string; scopeId: number; roleCode: string },
      context: any
    ) {
      return updateAuthorizationRoleAssignment(args, context, true);
    }
  }
};

async function updateAuthorizationRoleAssignment(
  args: { committeeId: number; userId: number; scope: string; scopeId: number; roleCode: string },
  context: any,
  revoke: boolean
): Promise<boolean> {
  const loggedInUserId = await getLoggedInUserId(context);
  const committeeId = Number(args?.committeeId);
  await assertCanManageAuthorization(loggedInUserId, committeeId);

  const userId = Number(args?.userId);
  const scope = String(args?.scope || '').trim().toUpperCase();
  const scopeId = Number(args?.scopeId);
  const roleCode = String(args?.roleCode || '').trim().toUpperCase();
  if (!Number.isInteger(userId) || userId <= 0) {
    throwEventError('BAD_REQUEST', 'userId must be a positive integer');
  }
  if (scope !== 'COMMITTEE' && scope !== 'EVENT') {
    throwEventError('BAD_REQUEST', 'scope must be COMMITTEE or EVENT');
  }
  if (!Number.isInteger(scopeId) || scopeId <= 0 ||
    (scope === 'COMMITTEE' && scopeId !== committeeId)) {
    throwEventError('BAD_REQUEST', 'scopeId is invalid for the selected scope');
  }
  if (!/^[A-Z0-9_]{2,100}$/.test(roleCode)) {
    throwEventError('BAD_REQUEST', 'roleCode must contain 2 to 100 letters, digits, or underscores');
  }
  if (scope === 'COMMITTEE' && roleCode === 'COMMITTEE_MASTER_ADMIN') {
    throwEventError('FORBIDDEN', 'The master admin role is assigned through committee membership');
  }

  const connection = await getConnection();
  try {
    if (scope === 'EVENT') {
      const [eventRows] = await connection.execute<any[]>(
        `SELECT id FROM events WHERE id = ? AND committee_id = ? LIMIT 1`,
        [scopeId, committeeId]
      );
      if (eventRows.length === 0) {
        throwEventError('NOT_FOUND', 'Event not found in this committee');
      }
    }

    const [membershipRows] = await connection.execute<any[]>(
      `SELECT user_id FROM users_committees WHERE committee_id = ? AND user_id = ? LIMIT 1`,
      [committeeId, userId]
    );
    if (membershipRows.length === 0) {
      throwEventError('BAD_REQUEST', 'The assigned user must be a member of this committee');
    }

    const [roleRows] = await connection.execute<any[]>(
      `SELECT id FROM authorization_roles WHERE scope = ? AND role_code = ? LIMIT 1`,
      [scope, roleCode]
    );
    if (roleRows.length === 0) {
      throwEventError('NOT_FOUND', 'Authorization role not found');
    }

    if (revoke) {
      await connection.execute(
        `DELETE FROM authorization_user_roles
         WHERE user_id = ? AND role_id = ? AND scope = ? AND scope_id = ?`,
        [userId, Number(roleRows[0].id), scope, scopeId]
      );
    } else {
      await connection.execute(
        `INSERT INTO authorization_user_roles (user_id, role_id, scope, scope_id, assigned_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE assigned_by = VALUES(assigned_by), assigned_at = CURRENT_TIMESTAMP`,
        [userId, Number(roleRows[0].id), scope, scopeId, loggedInUserId]
      );
    }
    return true;
  } finally {
    connection.release();
  }
}
