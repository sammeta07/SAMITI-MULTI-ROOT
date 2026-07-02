import { execute, query } from '../../config/db';

export const submitCommitteeMembershipRequestTypes = `
  enum CommitteeMembershipRequestRole {
    COMITTEE_MEMBER
    COMITTEE_ADMIN
  }

  type SubmitCommitteeMembershipRequestPayload {
    statusCode: Int!
    status: String!
    message: String!
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
      args: { committeeId: number; requestRole: 'COMITTEE_MEMBER' | 'COMITTEE_ADMIN' },
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
            is_committee_admin,
            is_committee_member,
            membership_status,
            admin_status
          FROM committee_members
          WHERE committee_id = ? AND user_id = ?
          LIMIT 1
        `,
        [committeeId, loggedInUserId]
      );

      if (requestRole === 'COMITTEE_ADMIN') {
        if (existingMembershipRows.length === 0) {
          throw new Error('Only accepted committee members can request admin role');
        }

        const existingMembership = existingMembershipRows[0];
        const membershipStatus = String(existingMembership.membership_status || '').toUpperCase();
        const adminStatus = String(existingMembership.admin_status || '').toUpperCase();
        const isCommitteeAdmin = Number(existingMembership.is_committee_admin) === 1;

        if (isCommitteeAdmin || adminStatus === 'ACCEPTED') {
          return {
            statusCode: 200,
            status: 'success',
            message: 'You are already an admin in this committee',
            committeeId,
            requestedByUserId: loggedInUserId,
            requestedAtDateTime,
            requestedRole: requestRole,
            membershipStatus: 'ACCEPTED'
          };
        }

        if (membershipStatus !== 'ACCEPTED') {
          throw new Error('Only accepted committee members can request admin role');
        }

        if (adminStatus === 'PENDING') {
          return {
            statusCode: 200,
            status: 'success',
            message: 'Admin role request already pending for this committee',
            committeeId,
            requestedByUserId: loggedInUserId,
            requestedAtDateTime,
            requestedRole: requestRole,
            membershipStatus: 'PENDING'
          };
        }

        await execute(
          `
            UPDATE committee_members
            SET
              admin_status = 'PENDING',
              admin_request_created_at = NOW(),
              admin_status_action_by = NULL,
              admin_status_action_at = NULL
            WHERE committee_id = ? AND user_id = ?
          `,
          [committeeId, loggedInUserId]
        );

        return {
          statusCode: 200,
          status: 'success',
          message: 'Committee admin role request submitted successfully',
          committeeId,
          requestedByUserId: loggedInUserId,
          requestedAtDateTime,
          requestedRole: requestRole,
          membershipStatus: 'PENDING'
        };
      }

      if (existingMembershipRows.length > 0) {
        const existingMembership = existingMembershipRows[0];
        const existingMembershipStatus = String(existingMembership.membership_status || '').toUpperCase();
        const isExistingCommitteeMember = Number(existingMembership.is_committee_member) === 1;

        if (isExistingCommitteeMember && existingMembershipStatus === 'ACCEPTED') {
          return {
            statusCode: 200,
            status: 'success',
            message: 'You are already a committee member',
            committeeId,
            requestedByUserId: loggedInUserId,
            requestedAtDateTime,
            requestedRole: requestRole,
            membershipStatus: 'ACCEPTED'
          };
        }

        if (existingMembershipStatus === 'PENDING') {
          return {
            statusCode: 200,
            status: 'success',
            message: 'Join request already pending for this committee',
            committeeId,
            requestedByUserId: loggedInUserId,
            requestedAtDateTime,
            requestedRole: requestRole,
            membershipStatus: 'PENDING'
          };
        }

        await execute(
          `
            UPDATE committee_members
            SET
              is_committee_admin = 0,
              is_committee_member = 0,
              membership_status = 'PENDING',
              membership_request_created_at = NOW(),
              membership_status_action_by = ?,
              membership_status_action_at = NOW(),
              admin_status = NULL,
              admin_request_created_at = NULL,
              admin_status_action_by = NULL,
              admin_status_action_at = NULL
            WHERE committee_id = ? AND user_id = ?
          `,
          [loggedInUserId, committeeId, loggedInUserId]
        );
      } else {
        await execute(
          `
            INSERT INTO committee_members (
              committee_id,
              user_id,
              is_committee_admin,
              is_committee_member,
              membership_status,
              membership_request_created_at,
              membership_status_action_by,
              membership_status_action_at,
              admin_status,
              admin_request_created_at,
              admin_status_action_by,
              admin_status_action_at,
              is_favourite
            )
            VALUES (?, ?, 0, 0, 'PENDING', NOW(), ?, NOW(), NULL, NULL, NULL, 0)
          `,
          [committeeId, loggedInUserId, loggedInUserId]
        );
      }

      return {
        statusCode: 200,
        status: 'success',
        message: 'Committee membership request submitted successfully',
        committeeId,
        requestedByUserId: loggedInUserId,
        requestedAtDateTime,
        requestedRole: requestRole,
        membershipStatus: 'PENDING'
      };
    }
  }
};
