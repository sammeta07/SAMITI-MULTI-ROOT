import { execute, query } from '../../../config/db';

export const cancelCommitteeMembershipRequestTypes = `
  type CancelCommitteeMembershipRequestPayload {
    committeeId: Int!
    cancelledByUserId: Int!
    cancelledAtDateTime: String!
    membershipStatus: String
  }
`;

export const cancelCommitteeMembershipRequestMutationFields = `
  cancelCommitteeMembershipRequest(committeeId: Int!): CancelCommitteeMembershipRequestPayload!
`;

export const cancelCommitteeMembershipRequestResolvers = {
  Mutation: {
    async cancelCommitteeMembershipRequest(_: any, args: { committeeId: number }, context: any) {
      const { committeeId } = args;

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

      const cancelledAtDateTime = new Date().toISOString();

      const committeeRows = await query<any[]>(
        `SELECT id FROM committees WHERE id = ? LIMIT 1`,
        [committeeId]
      );
      if (!committeeRows || committeeRows.length === 0) {
        throw new Error(`Committee with ID ${committeeId} not found`);
      }

      // Find the latest PENDING request by this user for this committee
      const pendingRows = await query<any[]>(
        `SELECT id, request_role
         FROM committee_role_requests
         WHERE committee_id = ? AND requester_user_id = ? AND status = 'PENDING'
         ORDER BY requested_at DESC
         LIMIT 1`,
        [committeeId, loggedInUserId]
      );

      if (pendingRows.length === 0) {
        return {
          committeeId,
          cancelledByUserId: loggedInUserId,
          cancelledAtDateTime,
          membershipStatus: null
        };
      }

      const pendingRequestId = pendingRows[0].id;

      await execute(
        `UPDATE committee_role_requests
         SET status = 'CANCELLED', cancel_by_user_id = ?, cancel_at = NOW()
         WHERE id = ?`,
        [loggedInUserId, pendingRequestId]
      );

      return {
        committeeId,
        cancelledByUserId: loggedInUserId,
        cancelledAtDateTime,
        membershipStatus: null
      };
    }
  }
};
