import { execute, query } from '../../config/db';

export const cancelCommitteeMembershipRequestTypes = `
  type CancelCommitteeMembershipRequestPayload {
    statusCode: Int!
    status: String!
    message: String!
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

      const committeeRows = await query<any[]>(
        `
          SELECT id
          FROM committees
          WHERE id = ?
          LIMIT 1
        `,
        [committeeId]
      );

      if (!committeeRows || committeeRows.length === 0) {
        throw new Error(`Committee with ID ${committeeId} not found`);
      }

      const existingMembershipRows = await query<any[]>(
        `
          SELECT
            membership_status,
            admin_status
          FROM committee_members
          WHERE committee_id = ? AND user_id = ?
          LIMIT 1
        `,
        [committeeId, loggedInUserId]
      );

      if (existingMembershipRows.length === 0) {
        return {
          statusCode: 200,
          status: 'success',
          message: 'No membership request found for this committee',
          committeeId,
          cancelledByUserId: loggedInUserId,
          cancelledAtDateTime: new Date().toISOString(),
          membershipStatus: null
        };
      }

      const existingMembershipStatus = String(existingMembershipRows[0].membership_status || '').toUpperCase();
      const existingAdminStatus = String(existingMembershipRows[0].admin_status || '').toUpperCase();
      const hasPendingAdminRoleRequest = existingAdminStatus === 'PENDING';
      const hasPendingMembershipRequest = existingMembershipStatus === 'PENDING';

      if (!hasPendingAdminRoleRequest && !hasPendingMembershipRequest) {
        return {
          statusCode: 200,
          status: 'success',
          message: 'Only pending requests can be cancelled',
          committeeId,
          cancelledByUserId: loggedInUserId,
          cancelledAtDateTime: new Date().toISOString(),
          membershipStatus: (existingAdminStatus || existingMembershipStatus) || null
        };
      }

      if (hasPendingAdminRoleRequest) {
        await execute(
          `
            UPDATE committee_members
            SET
              admin_status = NULL,
              admin_request_created_at = NULL,
              admin_status_action_by = ?,
              admin_status_action_at = NOW()
            WHERE committee_id = ? AND user_id = ?
          `,
          [loggedInUserId, committeeId, loggedInUserId]
        );
      } else {
        await execute(
          `
            UPDATE committee_members
            SET
              is_committee_member = 0,
              membership_status = NULL,
              membership_request_created_at = NULL,
              membership_status_action_by = ?,
              membership_status_action_at = NOW()
            WHERE committee_id = ? AND user_id = ?
          `,
          [loggedInUserId, committeeId, loggedInUserId]
        );
      }

      return {
        statusCode: 200,
        status: 'success',
        message: hasPendingAdminRoleRequest ? 'Admin role request cancelled successfully' : 'Join request cancelled successfully',
        committeeId,
        cancelledByUserId: loggedInUserId,
        cancelledAtDateTime: new Date().toISOString(),
        membershipStatus: null
      };
    }
  }
};
