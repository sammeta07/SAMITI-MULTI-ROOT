import { query } from '../../../../config/db';

export const receivedCommitteeMemberRequestsTypes = `
  type ReceivedCommitteeMemberRequestItem {
    committeeId: Int!
    committeeName: String!
    committeeLogo: String
    address: String
    actionByUserId: Int
    resolvedByName: String
    resolvedByPhoto: String
    requestRole: String!
    status: String!
    committeeRole: String
    requestSentTime: String
    resolvedAtTime: String
    userDetails: CommitteeMembershipRequesterUserDetails!
  }

  type ReceivedCommitteeMemberRequestsResponse {
    data: [ReceivedCommitteeMemberRequestItem!]!
  }
`;

export const receivedCommitteeMemberRequestsQueryFields = `
  receivedCommitteeMemberRequests: ReceivedCommitteeMemberRequestsResponse!
`;

export const receivedCommitteeMemberRequestsResolvers = {
  Query: {
    async receivedCommitteeMemberRequests(_: any, __: any, context: any) {
      const authHeader = context.headers?.authorization;
      const tokenFromCookie = context.cookies?.token;
      let accessToken: string | null = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.slice(7);
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

      const rows = await query<any[]>(
        `WITH latest_requests AS (
          SELECT 
            MAX(id) AS latest_id
          FROM committee_role_requests
           WHERE status = 'PENDING'
            AND request_role = 'COMMITTEE_MEMBER'
          GROUP BY committee_id, requester_user_id
        )
        SELECT
            c.id                                            AS committee_id,
            c.committee_name,
            c.logo                                          AS committee_logo,
            c.address,
            crr.action_by_user_id,
            action_user.name                                AS resolved_by_name,
            action_user.profile_photo                       AS resolved_by_photo,
            crr.request_role                                AS request_role,
            DATE_FORMAT(crr.requested_at, '%Y-%m-%d %H:%i:%s') AS request_sent_time,
            crr.status,
            requester_uc.committee_role                      AS committee_role,
            DATE_FORMAT(crr.action_at, '%Y-%m-%d %H:%i:%s')    AS resolved_at_time,
            u.id                                           AS user_id,
            u.name,
            u.email,
            u.mobile,
            u.date_of_birth,
            u.gender,
            u.profile_photo                                AS photo
         FROM committee_role_requests crr
         INNER JOIN latest_requests lr ON lr.latest_id = crr.id
         INNER JOIN committees c ON c.id = crr.committee_id
         INNER JOIN users u ON u.id = crr.requester_user_id
         LEFT JOIN users action_user ON action_user.id = crr.action_by_user_id
         INNER JOIN users_committees admin_uc
            ON admin_uc.committee_id = crr.committee_id
            AND admin_uc.user_id = ?
            AND admin_uc.committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         LEFT JOIN users_committees requester_uc
            ON requester_uc.committee_id = crr.committee_id
            AND requester_uc.user_id = crr.requester_user_id
         WHERE crr.requester_user_id <> ?
         ORDER BY crr.requested_at DESC`,
        [loggedInUserId, loggedInUserId]
      );

      return {
        data: rows.map((row: any) => ({
          committeeId: Number(row.committee_id),
          committeeName: row.committee_name,
          committeeLogo: row.committee_logo || null,
          address: row.address,
          actionByUserId: row.action_by_user_id ? Number(row.action_by_user_id) : null,
          resolvedByName: row.resolved_by_name,
          resolvedByPhoto: row.resolved_by_photo,
          requestRole: row.request_role,
          requestSentTime: row.request_sent_time,
          resolvedAtTime: row.resolved_at_time || null,
          status: String(row.status),
          committeeRole: row.committee_role,
          userDetails: {
            userId: Number(row.user_id),
            name: row.name,
            email: row.email,
            mobile: row.mobile,
            dateOfBirth: row.date_of_birth,
            gender: row.gender,
            photo: row.photo
          }
        }))
      };
    }
  }
};
