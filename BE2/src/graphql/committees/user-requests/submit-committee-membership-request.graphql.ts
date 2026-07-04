import { execute, query } from '../../../config/db';

export const submitCommitteeMembershipRequestTypes = `
  enum CommitteeMembershipRequestRole {
    COMMITTEE_MEMBER
    COMMITTEE_ADMIN
  }

  type SubmitCommitteeMembershipRequestPayload {
    committeeId: Int!
    requestedByUserId: Int!
    requestedAtDateTime: String!
    requestedRole: CommitteeMembershipRequestRole!
    membershipStatus: String!
  }
`;

export const submitCommitteeMembershipRequestMutationFields = `
  submitCommitteeMembershipRequest(committeeId: Int!, requestRole: CommitteeMembershipRequestRole!): SubmitCommitteeMembershipRequestPayload!
`;

export const submitCommitteeMembershipRequestResolvers = {
  Mutation: {
    async submitCommitteeMembershipRequest(
      _: any,
      args: { committeeId: number; requestRole: 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' },
      context: any
    ) {
      const { committeeId, requestRole } = args;

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

      const requestedAtDateTime = new Date().toISOString();

      // Verify committee exists
      const committeeRows = await query<any[]>(
        `SELECT id FROM committees WHERE id = ? LIMIT 1`,
        [committeeId]
      );
      if (!committeeRows || committeeRows.length === 0) {
        throw new Error(`Committee with ID ${committeeId} not found`);
      }

      // Get current membership state
      const membershipRows = await query<any[]>(
        `SELECT is_committee_admin, is_committee_member
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [committeeId, loggedInUserId]
      );

      // Check existing pending request for this role
      const existingPendingRows = await query<any[]>(
        `SELECT id FROM committee_role_requests
         WHERE committee_id = ? AND requester_user_id = ? AND request_role = ? AND status = 'PENDING'
         LIMIT 1`,
        [committeeId, loggedInUserId, requestRole]
      );

      if (requestRole === 'COMMITTEE_ADMIN') {
        // Must be accepted member first
        if (membershipRows.length === 0 || Number(membershipRows[0].is_committee_member) !== 1) {
          throw new Error('Only accepted committee members can request admin role');
        }
        // Already admin
        if (Number(membershipRows[0].is_committee_admin) === 1) {
          return {
            committeeId,
            requestedByUserId: loggedInUserId,
            requestedAtDateTime,
            requestedRole: requestRole,
            membershipStatus: 'ACCEPTED'
          };
        }
      }

      if (requestRole === 'COMMITTEE_MEMBER') {
        // Already an accepted member
        if (membershipRows.length > 0 && Number(membershipRows[0].is_committee_member) === 1) {
          return {
            committeeId,
            requestedByUserId: loggedInUserId,
            requestedAtDateTime,
            requestedRole: requestRole,
            membershipStatus: 'ACCEPTED'
          };
        }
      }

      // Already has a pending request for this role
      if (existingPendingRows.length > 0) {
        return {
          committeeId,
          requestedByUserId: loggedInUserId,
          requestedAtDateTime,
          requestedRole: requestRole,
          membershipStatus: 'PENDING'
        };
      }

      // Insert new request into committee_role_requests
      await execute(
        `INSERT INTO committee_role_requests
           (committee_id, requester_user_id, request_role, status, requested_at)
         VALUES (?, ?, ?, 'PENDING', NOW())`,
        [committeeId, loggedInUserId, requestRole]
      );

      // Ensure a users_committees row exists (for favourite/state tracking)
      await execute(
        `INSERT INTO users_committees (committee_id, user_id, is_committee_admin, is_committee_member, is_favourite)
         VALUES (?, ?, 0, 0, 0)
         ON DUPLICATE KEY UPDATE committee_id = committee_id`,
        [committeeId, loggedInUserId]
      );

      return {
        committeeId,
        requestedByUserId: loggedInUserId,
        requestedAtDateTime,
        requestedRole: requestRole,
        membershipStatus: 'PENDING'
      };
    }
  }
};
