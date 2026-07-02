import { execute, query } from '../../config/db';

export const committeeMembershipRequestsTypes = `
  enum CommitteeMembershipDecisionAction {
    ACCEPTED
    REJECTED
  }

  enum CommitteeMembershipRequestType {
    COMITTEE_MEMBER
    COMITTEE_ADMIN
  }

  type CommitteeMembershipRequesterUserDetails {
    user_id: Int!
    name: String!
    email: String!
    mobile: String
    date_of_birth: String
    gender: String
    photo: String
  }

  type ReceivedCommitteeMembershipRequestItem {
    committee_id: Int!
    committee_name: String!
    area: String
    request_type: CommitteeMembershipRequestType!
    request_sent_time: String
    user_details: CommitteeMembershipRequesterUserDetails!
  }

  type SentCommitteeMembershipRequestItem {
    committee_id: Int!
    committee_name: String!
    request_type: CommitteeMembershipRequestType!
    area: String
    since: Int
    status: String!
    request_sent_time: String
    resolved_by_name: String
    resolved_by_email: String
    resolved_by_photo: String
    resolved_at_time: String
  }

  type ActionTakenOnCommitteeMembershipRequestItem {
    committee_id: Int!
    committee_name: String!
    request_type: CommitteeMembershipRequestType!
    request_sent_time: String
    action_at_time: String
    status: String!
    user_details: CommitteeMembershipRequesterUserDetails!
  }

  type ReceivedCommitteeMembershipRequestsResponse {
    statusCode: Int!
    status: String!
    message: String!
    data: [ReceivedCommitteeMembershipRequestItem!]!
  }

  type SentCommitteeMembershipRequestsResponse {
    statusCode: Int!
    status: String!
    message: String!
    data: [SentCommitteeMembershipRequestItem!]!
  }

  type ActionTakenOnCommitteeMembershipRequestsResponse {
    statusCode: Int!
    status: String!
    message: String!
    data: [ActionTakenOnCommitteeMembershipRequestItem!]!
  }

  type TakeActionOnCommitteeMembershipRequestResponse {
    statusCode: Int!
    status: String!
    message: String!
    committeeId: Int!
    targetUserId: Int!
    updatedMembershipStatus: String!
  }
`;

export const committeeMembershipRequestsQueryFields = `
  receivedCommitteeMembershipRequestsForAdminCommittees: ReceivedCommitteeMembershipRequestsResponse!
  sentCommitteeMembershipRequestsByLoggedInUser: SentCommitteeMembershipRequestsResponse!
  actionTakenOnCommitteeMembershipRequestsByLoggedInUser: ActionTakenOnCommitteeMembershipRequestsResponse!
`;

export const committeeMembershipRequestsMutationFields = `
  takeActionOnCommitteeMembershipRequest(committeeId: Int!, targetUserId: Int!, decisionAction: CommitteeMembershipDecisionAction!): TakeActionOnCommitteeMembershipRequestResponse!
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

export const committeeMembershipRequestsResolvers = {
  Query: {
    async receivedCommitteeMembershipRequestsForAdminCommittees(_: any, __: any, context: any) {
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);

      const rows = await query<any[]>(
        `
          SELECT
            c.id AS committee_id,
            c.committee_name,
            c.area,
            CASE
              WHEN cm.admin_status = 'PENDING' THEN 'COMITTEE_ADMIN'
              ELSE 'COMITTEE_MEMBER'
            END AS request_type,
            DATE_FORMAT(
              CASE
                WHEN cm.admin_status = 'PENDING' THEN cm.admin_request_created_at
                ELSE cm.membership_request_created_at
              END,
              '%Y-%m-%d %H:%i:%s'
            ) AS request_sent_time,
            u.id AS user_id,
            u.name,
            u.email,
            u.mobile,
            u.date_of_birth,
            u.gender,
            u.profile_photo AS photo
          FROM committee_members cm
          INNER JOIN committees c ON c.id = cm.committee_id
          INNER JOIN users u ON u.id = cm.user_id
          INNER JOIN committee_members admin_cm
            ON admin_cm.committee_id = cm.committee_id
            AND admin_cm.user_id = ?
            AND admin_cm.is_committee_admin = 1
            AND admin_cm.membership_status = 'ACCEPTED'
          WHERE (
              (cm.membership_status = 'PENDING' AND cm.is_committee_admin = 0)
              OR
              (cm.admin_status = 'PENDING' AND cm.membership_status = 'ACCEPTED')
            )
            AND cm.user_id <> ?
          ORDER BY
            CASE
              WHEN cm.admin_status = 'PENDING' THEN cm.admin_request_created_at
              ELSE cm.membership_request_created_at
            END DESC
        `,
        [loggedInUserId, loggedInUserId]
      );

      return {
        statusCode: 200,
        status: 'success',
        message: 'Received committee membership requests fetched successfully',
        data: rows.map((row) => ({
          committee_id: Number(row.committee_id),
          committee_name: row.committee_name,
          area: row.area,
          request_type: row.request_type === 'COMITTEE_ADMIN' ? 'COMITTEE_ADMIN' : 'COMITTEE_MEMBER',
          request_sent_time: row.request_sent_time,
          user_details: {
            user_id: Number(row.user_id),
            name: row.name,
            email: row.email,
            mobile: row.mobile,
            date_of_birth: row.date_of_birth,
            gender: row.gender,
            photo: row.photo
          }
        }))
      };
    },

    async sentCommitteeMembershipRequestsByLoggedInUser(_: any, __: any, context: any) {
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);

      const rows = await query<any[]>(
        `
          SELECT
            c.id AS committee_id,
            c.committee_name,
            CASE
              WHEN cm.admin_status IS NOT NULL THEN 'COMITTEE_ADMIN'
              ELSE 'COMITTEE_MEMBER'
            END AS request_type,
            c.area,
            c.since,
            CASE
              WHEN cm.admin_status IS NOT NULL THEN cm.admin_status
              ELSE cm.membership_status
            END AS status,
            DATE_FORMAT(
              CASE
                WHEN cm.admin_status IS NOT NULL THEN cm.admin_request_created_at
                ELSE cm.membership_request_created_at
              END,
              '%Y-%m-%d %H:%i:%s'
            ) AS request_sent_time,
            CASE
              WHEN (
                (cm.admin_status IS NOT NULL AND cm.admin_status IN ('ACCEPTED', 'REJECTED'))
                OR
                (cm.admin_status IS NULL AND cm.membership_status IN ('ACCEPTED', 'REJECTED'))
              ) THEN action_user.name
              ELSE NULL
            END AS resolved_by_name,
            CASE
              WHEN (
                (cm.admin_status IS NOT NULL AND cm.admin_status IN ('ACCEPTED', 'REJECTED'))
                OR
                (cm.admin_status IS NULL AND cm.membership_status IN ('ACCEPTED', 'REJECTED'))
              ) THEN action_user.email
              ELSE NULL
            END AS resolved_by_email,
            CASE
              WHEN (
                (cm.admin_status IS NOT NULL AND cm.admin_status IN ('ACCEPTED', 'REJECTED'))
                OR
                (cm.admin_status IS NULL AND cm.membership_status IN ('ACCEPTED', 'REJECTED'))
              ) THEN action_user.profile_photo
              ELSE NULL
            END AS resolved_by_photo,
            CASE
              WHEN (
                (cm.admin_status IS NOT NULL AND cm.admin_status IN ('ACCEPTED', 'REJECTED'))
                OR
                (cm.admin_status IS NULL AND cm.membership_status IN ('ACCEPTED', 'REJECTED'))
              ) THEN DATE_FORMAT(
                CASE
                  WHEN cm.admin_status IS NOT NULL THEN cm.admin_status_action_at
                  ELSE cm.membership_status_action_at
                END,
                '%Y-%m-%d %H:%i:%s'
              )
              ELSE NULL
            END AS resolved_at_time
          FROM committee_members cm
          INNER JOIN committees c ON c.id = cm.committee_id
          LEFT JOIN users action_user
            ON action_user.id = CASE
                WHEN cm.admin_status IS NOT NULL THEN cm.admin_status_action_by
                ELSE cm.membership_status_action_by
              END
          WHERE cm.user_id = ?
            AND (
              cm.membership_status IS NOT NULL
              OR cm.admin_status IS NOT NULL
            )
          ORDER BY
            CASE
              WHEN cm.admin_status IS NOT NULL THEN cm.admin_request_created_at
              ELSE cm.membership_request_created_at
            END DESC
        `,
        [loggedInUserId]
      );

      return {
        statusCode: 200,
        status: 'success',
        message: 'Sent committee membership requests fetched successfully',
        data: rows.map((row) => ({
          committee_id: Number(row.committee_id),
          committee_name: row.committee_name,
          request_type: row.request_type === 'COMITTEE_ADMIN' ? 'COMITTEE_ADMIN' : 'COMITTEE_MEMBER',
          area: row.area,
          since: row.since ? Number(row.since) : null,
          status: String(row.status || 'PENDING'),
          request_sent_time: row.request_sent_time,
          resolved_by_name: row.resolved_by_name,
          resolved_by_email: row.resolved_by_email,
          resolved_by_photo: row.resolved_by_photo,
          resolved_at_time: row.resolved_at_time
        }))
      };
    },

    async actionTakenOnCommitteeMembershipRequestsByLoggedInUser(_: any, __: any, context: any) {
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);

      const rows = await query<any[]>(
        `
          SELECT
            c.id AS committee_id,
            c.committee_name,
            CASE
              WHEN cm.admin_status IS NOT NULL THEN 'COMITTEE_ADMIN'
              ELSE 'COMITTEE_MEMBER'
            END AS request_type,
            DATE_FORMAT(
              CASE
                WHEN cm.admin_status IS NOT NULL THEN cm.admin_request_created_at
                ELSE cm.membership_request_created_at
              END,
              '%Y-%m-%d %H:%i:%s'
            ) AS request_sent_time,
            DATE_FORMAT(
              CASE
                WHEN cm.admin_status IS NOT NULL THEN cm.admin_status_action_at
                ELSE cm.membership_status_action_at
              END,
              '%Y-%m-%d %H:%i:%s'
            ) AS action_at_time,
            CASE
              WHEN cm.admin_status IS NOT NULL THEN cm.admin_status
              ELSE cm.membership_status
            END AS status,
            u.id AS user_id,
            u.name,
            u.email,
            u.mobile,
            u.date_of_birth,
            u.gender,
            u.profile_photo AS photo
          FROM committee_members cm
          INNER JOIN committees c ON c.id = cm.committee_id
          INNER JOIN users u ON u.id = cm.user_id
          WHERE (
              (cm.membership_status IN ('ACCEPTED', 'REJECTED') AND cm.membership_status_action_by = ?)
              OR
              (cm.admin_status IN ('ACCEPTED', 'REJECTED') AND cm.admin_status_action_by = ?)
            )
            AND cm.user_id <> ?
          ORDER BY
            CASE
              WHEN cm.admin_status IN ('ACCEPTED', 'REJECTED') THEN cm.admin_status_action_at
              ELSE cm.membership_status_action_at
            END DESC
        `,
        [loggedInUserId, loggedInUserId, loggedInUserId]
      );

      return {
        statusCode: 200,
        status: 'success',
        message: 'Action-taken committee membership requests fetched successfully',
        data: rows.map((row) => ({
          committee_id: Number(row.committee_id),
          committee_name: row.committee_name,
          request_type: row.request_type === 'COMITTEE_ADMIN' ? 'COMITTEE_ADMIN' : 'COMITTEE_MEMBER',
          request_sent_time: row.request_sent_time,
          action_at_time: row.action_at_time,
          status: String(row.status),
          user_details: {
            user_id: Number(row.user_id),
            name: row.name,
            email: row.email,
            mobile: row.mobile,
            date_of_birth: row.date_of_birth,
            gender: row.gender,
            photo: row.photo
          }
        }))
      };
    }
  },

  Mutation: {
    async takeActionOnCommitteeMembershipRequest(
      _: any,
      args: { committeeId: number; targetUserId: number; decisionAction: 'ACCEPTED' | 'REJECTED' },
      context: any
    ) {
      const { committeeId, targetUserId, decisionAction } = args;
      const resolvedDecisionStatus = decisionAction === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED';
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);

      const adminValidationRows = await query<any[]>(
        `
          SELECT user_id
          FROM committee_members
          WHERE committee_id = ?
            AND user_id = ?
            AND is_committee_admin = 1
            AND membership_status = 'ACCEPTED'
          LIMIT 1
        `,
        [committeeId, loggedInUserId]
      );

      if (adminValidationRows.length === 0) {
        throw new Error('Forbidden: Only accepted committee admins can take membership actions');
      }

      const membershipRows = await query<any[]>(
        `
          SELECT membership_status, admin_status, is_committee_admin
          FROM committee_members
          WHERE committee_id = ? AND user_id = ?
          LIMIT 1
        `,
        [committeeId, targetUserId]
      );

      if (membershipRows.length === 0) {
        throw new Error('Membership request not found for this committee and user');
      }

      const currentMembershipStatus = String(membershipRows[0].membership_status || '').toUpperCase();
      const currentAdminStatus = String(membershipRows[0].admin_status || '').toUpperCase();

      const hasPendingMemberRequest = currentMembershipStatus === 'PENDING';
      const hasPendingAdminRequest = currentAdminStatus === 'PENDING';

      if (!hasPendingMemberRequest && !hasPendingAdminRequest) {
        throw new Error('Only pending membership requests can be processed');
      }

      if (hasPendingAdminRequest) {
        await execute(
          `
            UPDATE committee_members
            SET
              is_committee_admin = ?,
              admin_status = ?,
              admin_status_action_by = ?,
              admin_status_action_at = NOW()
            WHERE committee_id = ? AND user_id = ?
          `,
          [decisionAction === 'ACCEPTED' ? 1 : 0, resolvedDecisionStatus, loggedInUserId, committeeId, targetUserId]
        );
      } else {
        await execute(
          `
            UPDATE committee_members
            SET
              is_committee_member = ?,
              membership_status = ?,
              membership_status_action_by = ?,
              membership_status_action_at = NOW()
            WHERE committee_id = ? AND user_id = ?
          `,
          [decisionAction === 'ACCEPTED' ? 1 : 0, resolvedDecisionStatus, loggedInUserId, committeeId, targetUserId]
        );
      }

      return {
        statusCode: 200,
        status: 'success',
        message: hasPendingAdminRequest
          ? (decisionAction === 'ACCEPTED' ? 'Admin role request accepted successfully' : 'Admin role request rejected successfully')
          : (decisionAction === 'ACCEPTED' ? 'Membership request accepted successfully' : 'Membership request rejected successfully'),
        committeeId,
        targetUserId,
        updatedMembershipStatus: resolvedDecisionStatus
      };
    }
  }
};
