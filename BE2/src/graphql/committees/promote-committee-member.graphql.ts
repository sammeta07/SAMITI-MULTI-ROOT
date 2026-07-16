import { execute, query } from '../../config/db';

// ─── Master admin promotes an existing COMMITTEE_MEMBER to COMMITTEE_ADMIN ─────

export const promoteCommitteeMemberTypes = `
  enum CommitteeMemberPromotionRole {
    COMMITTEE_ADMIN
  }

  type PromoteCommitteeMemberResponse {
    committeeId: Int!
    targetUserId: Int!
    newRole: String!
    actionByUserId: Int!
    actionAtTime: String!
  }
`;

export const promoteCommitteeMemberMutationFields = `
  promoteCommitteeMember(committeeId: Int!, targetUserId: Int!, newRole: CommitteeMemberPromotionRole!): PromoteCommitteeMemberResponse!
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

export const promoteCommitteeMemberResolvers = {
  Mutation: {
    // ── Master admin promotes a member to admin ──────────────────────────────
    async promoteCommitteeMember(
      _: any,
      args: { committeeId: number; targetUserId: number; newRole: 'COMMITTEE_ADMIN' },
      context: any
    ) {
      const { committeeId, targetUserId, newRole } = args;
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);
      const actionAtTime = new Date().toISOString();

      if (newRole !== 'COMMITTEE_ADMIN') {
        throw new Error('Unsupported promotion role');
      }

      // Verify actor is the committee master admin or admin
      const actorRows = await query<any[]>(
        `SELECT committee_role FROM users_committees
         WHERE committee_id = ?
           AND user_id = ?
           AND committee_role IN ('COMMITTEE_MASTER_ADMIN', 'COMMITTEE_ADMIN')
         LIMIT 1`,
        [committeeId, loggedInUserId]
      );
      if (actorRows.length === 0) {
        throw new Error('Forbidden: Only committee admins can promote members');
      }

      const actorRole = String(actorRows[0].committee_role || '');

      // Verify target is currently an accepted COMMITTEE_MEMBER
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
      if (targetRole !== 'COMMITTEE_MEMBER') {
        throw new Error('Only committee members can be promoted to admin');
      }

      // 1) Update final membership state
      await execute(
        `UPDATE users_committees
         SET committee_role = 'COMMITTEE_ADMIN'
         WHERE committee_id = ? AND user_id = ?`,
        [committeeId, targetUserId]
      );

      // 2) Record the workflow entry (auto-accepted by the master admin)
      await execute(
        `INSERT INTO committee_role_requests
           (committee_id, requester_user_id, request_role, status, requested_at, action_by_user_id, action_at)
         VALUES (?, ?, 'COMMITTEE_ADMIN', 'ACCEPTED', NOW(), ?, NOW())`,
        [committeeId, targetUserId, loggedInUserId]
      );

      return {
        committeeId,
        targetUserId,
        newRole: 'COMMITTEE_ADMIN',
        actionByUserId: loggedInUserId,
        actionAtTime
      };
    }
  }
};
