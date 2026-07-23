import { query } from '../../../../config/db';

export const sentCommitteeAdminRequestsTypes = `
  type SentCommitteeAdminRequestItem {
    committeeId: Int!
    committeeName: String!
    committeeLogo: String
    requesterUserId: Int!
    requesterName: String
    requesterEmail: String
    requesterPhoto: String
    actionByUserId: Int
    requestType: String!
    address: String
    establishYear: Int
    status: String!
    requestSentTime: String
    resolvedByName: String
    resolvedByEmail: String
    resolvedByPhoto: String
    resolvedAtTime: String
  }

  type SentCommitteeAdminRequestsResponse {
    data: [SentCommitteeAdminRequestItem!]!
  }
`;

export const sentCommitteeAdminRequestsQueryFields = `
  sentCommitteeAdminRequests: SentCommitteeAdminRequestsResponse!
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

export const sentCommitteeAdminRequestsResolvers = {
  Query: {
    async sentCommitteeAdminRequests(_: any, __: any, context: any) {
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);

      const rows = await query<any[]>(
        `WITH latest_requests AS (
          SELECT 
            MAX(id) AS latest_id
          FROM committee_role_requests
          WHERE requester_user_id = ?
          GROUP BY committee_id, requester_user_id
        )
        SELECT
            c.id                                            AS committee_id,
            c.committee_name,
            c.logo                                          AS committee_logo,
            crr.requester_user_id,
            requester_user.name                              AS requester_name,
            requester_user.email                            AS requester_email,
            requester_user.profile_photo                    AS requester_photo,
            COALESCE(crr.action_by_user_id, crr.cancel_by_user_id) AS action_by_user_id,
            crr.request_role                               AS request_type,
            c.address,
            c.establish_year,
            crr.status,
            DATE_FORMAT(crr.requested_at, '%Y-%m-%d %H:%i:%s') AS request_sent_time,
            action_user.name                               AS resolved_by_name,
            action_user.email                              AS resolved_by_email,
            action_user.profile_photo                      AS resolved_by_photo,
            DATE_FORMAT(COALESCE(crr.action_at, crr.cancel_at), '%Y-%m-%d %H:%i:%s') AS resolved_at_time
         FROM committee_role_requests crr
         INNER JOIN latest_requests lr ON lr.latest_id = crr.id
         INNER JOIN committees c ON c.id = crr.committee_id
         INNER JOIN users requester_user ON requester_user.id = crr.requester_user_id
         LEFT JOIN users action_user ON action_user.id = COALESCE(crr.action_by_user_id, crr.cancel_by_user_id)
         WHERE crr.requester_user_id = ?
           AND crr.request_role = 'COMMITTEE_ADMIN'
           AND (
             crr.status = 'CANCELLED'
             OR crr.action_by_user_id IS NULL
             OR crr.action_by_user_id <> crr.requester_user_id
           )
         ORDER BY crr.requested_at DESC`,
        [loggedInUserId, loggedInUserId]
      );

      return {
        data: rows.map((row: any) => ({
          committeeId: Number(row.committee_id),
          committeeName: row.committee_name,
          committeeLogo: row.committee_logo || null,
          requesterUserId: Number(row.requester_user_id),
          requesterName: row.requester_name,
          requesterEmail: row.requester_email || null,
          requesterPhoto: row.requester_photo,
          actionByUserId: row.action_by_user_id ? Number(row.action_by_user_id) : null,
          requestType: row.request_type as 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN',
          address: row.address,
          establishYear: row.establish_year ? Number(row.establish_year) : null,
          status: String(row.status),
          requestSentTime: row.request_sent_time,
          resolvedByName: row.resolved_by_name,
          resolvedByEmail: row.resolved_by_email,
          resolvedByPhoto: row.resolved_by_photo,
          resolvedAtTime: row.resolved_at_time
        }))
      };
    }
  }
};
