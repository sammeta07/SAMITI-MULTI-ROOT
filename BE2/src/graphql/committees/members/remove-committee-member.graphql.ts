import { execute, query } from '../../../config/db';
import { hasPermission, PERMISSIONS } from '../../../authorization/authorization';

// ─── Master admin removes a COMMITTEE_MEMBER or COMMITTEE_ADMIN from committee ─

export const removeCommitteeMemberTypes = `
  type RemoveCommitteeMemberResponse {
    committeeId: Int!
    targetUserId: Int!
    removedByUserId: Int!
    removedAtTime: String!
  }
`;

export const removeCommitteeMemberMutationFields = `
  removeCommitteeMember(committeeId: Int!, targetUserId: Int!): RemoveCommitteeMemberResponse!
`;

async function resolveLoggedInUserIdFromGraphQLContext(context: any): Promise<number> {
  const authHeader = context.headers?.authorization;
  const tokenFromCookie = context.cookies?.token;
  let accessToken: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7);
  } else if (tokenFromCookie) {
    accessToken = tokenFromCookie;
  }

  if (!accessToken) {
    throw new Error('Unauthorized: Missing access token');
  }

  const decoded: any = await context.jwt.verify(accessToken);
  const loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);
  if (!loggedInUserId) {
    throw new Error('Unauthorized: Invalid token');
  }

  return loggedInUserId;
}

export const removeCommitteeMemberResolvers = {
  Mutation: {
    // ── Master admin removes a member/admin from the committee ────────────────
    async removeCommitteeMember(
      _: any,
      args: { committeeId: number; targetUserId: number },
      context: any
    ) {
      const { committeeId, targetUserId } = args;
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);
      const removedAtTime = new Date().toISOString();

      // Verify actor is the committee master admin or admin
      const canManageMembers = await hasPermission(
        loggedInUserId,
        PERMISSIONS.COMMITTEE_MEMBERS_MANAGE,
        { type: 'COMMITTEE', id: committeeId }
      );
      if (!canManageMembers) {
        throw new Error('Forbidden: Only committee admins can remove members');
      }

      // Verify target exists in this committee
      const targetRows = await query<any[]>(
        `SELECT committee_role FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [committeeId, targetUserId]
      );
      if (targetRows.length === 0) {
        throw new Error('Target user is not a member of this committee');
      }

      const targetRole = String(targetRows[0].committee_role || '');
      const canManageAdmins = await hasPermission(
        loggedInUserId,
        PERMISSIONS.COMMITTEE_ADMINS_MANAGE,
        { type: 'COMMITTEE', id: committeeId }
      );
      if (!canManageAdmins) {
        // Admins can only remove COMMITTEE_MEMBER
        if (targetRole !== 'COMMITTEE_MEMBER') {
          throw new Error('Admins can only remove committee members');
        }
      } else {
        // Master admin can remove members or admins
        if (targetRole !== 'COMMITTEE_MEMBER' && targetRole !== 'COMMITTEE_ADMIN') {
          throw new Error('Only committee members or admins can be removed');
        }
      }

      // 1) Remove the membership row
      await execute(
        `DELETE FROM users_committees
         WHERE committee_id = ? AND user_id = ?`,
        [committeeId, targetUserId]
      );

      // 2) Record the removal as a new audit record on every action
      await execute(
        `INSERT INTO committee_role_requests
           (committee_id, requester_user_id, request_role, status, requested_at, action_by_user_id, action_at, cancel_by_user_id, cancel_at)
         VALUES (?, ?, ?, 'REMOVED', NOW(), ?, NOW(), ?, NOW())`,
        [committeeId, targetUserId, targetRole, loggedInUserId, loggedInUserId]
      );

      // 3) Record any lingering PENDING requests as REJECTED audit records
      await execute(
        `INSERT INTO committee_role_requests
           (committee_id, requester_user_id, request_role, status, requested_at, action_by_user_id, action_at)
         SELECT committee_id, requester_user_id, request_role, 'REJECTED', NOW(), ?, NOW()
         FROM committee_role_requests
         WHERE committee_id = ? AND requester_user_id = ? AND status = 'PENDING'`,
        [loggedInUserId, committeeId, targetUserId]
      );

      return {
        committeeId,
        targetUserId,
        removedByUserId: loggedInUserId,
        removedAtTime
      };
    }
  }
};
