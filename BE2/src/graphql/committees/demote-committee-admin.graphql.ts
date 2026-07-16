import { execute, query } from '../../config/db';

// ─── Master admin demotes an existing COMMITTEE_ADMIN to COMMITTEE_MEMBER ──────

export const demoteCommitteeAdminTypes = `
  enum CommitteeAdminDemotionRole {
    COMMITTEE_MEMBER
  }

  type DemoteCommitteeAdminResponse {
    committeeId: Int!
    targetUserId: Int!
    newRole: String!
    actionByUserId: Int!
    actionAtTime: String!
  }
`;

export const demoteCommitteeAdminMutationFields = `
  demoteCommitteeAdmin(committeeId: Int!, targetUserId: Int!, newRole: CommitteeAdminDemotionRole!): DemoteCommitteeAdminResponse!
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

export const demoteCommitteeAdminResolvers = {
  Mutation: {
    // ── Master admin demotes an admin to member ──────────────────────────────
    async demoteCommitteeAdmin(
      _: any,
      args: { committeeId: number; targetUserId: number; newRole: 'COMMITTEE_MEMBER' },
      context: any
    ) {
      const { committeeId, targetUserId, newRole } = args;
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);
      const actionAtTime = new Date().toISOString();

      if (newRole !== 'COMMITTEE_MEMBER') {
        throw new Error('Unsupported demotion role');
      }

      // Verify actor is the committee master admin
      const masterAdminRows = await query<any[]>(
        `SELECT user_id FROM users_committees
         WHERE committee_id = ?
           AND user_id = ?
           AND committee_role = 'COMMITTEE_MASTER_ADMIN'
         LIMIT 1`,
        [committeeId, loggedInUserId]
      );
      if (masterAdminRows.length === 0) {
        throw new Error('Forbidden: Only the committee master admin can demote admins');
      }

      // Verify target is currently a COMMITTEE_ADMIN
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
      if (targetRole !== 'COMMITTEE_ADMIN') {
        throw new Error('Only committee admins can be demoted to member');
      }

      // 1) Update final membership state
      await execute(
        `UPDATE users_committees
         SET committee_role = 'COMMITTEE_MEMBER'
         WHERE committee_id = ? AND user_id = ?`,
        [committeeId, targetUserId]
      );

      // 2) Resolve the original PENDING request row with the performed action
      //    (updates the same record to DEMOTED so it leaves the received list)
      await execute(
        `UPDATE committee_role_requests
         SET status = 'DEMOTED',
             request_role = 'COMMITTEE_MEMBER',
             action_by_user_id = ?,
             action_at = NOW()
         WHERE committee_id = ? AND requester_user_id = ? AND status = 'PENDING'`,
        [loggedInUserId, committeeId, targetUserId]
      );

      return {
        committeeId,
        targetUserId,
        newRole: 'COMMITTEE_MEMBER',
        actionByUserId: loggedInUserId,
        actionAtTime
      };
    }
  }
};
