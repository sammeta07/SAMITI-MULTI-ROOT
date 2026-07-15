import { execute, query } from '../../config/db';

// ─── All queries/mutations now use committee_role_requests for workflow ───────

export const committeeMembershipRequestsTypes = `
  enum CommitteeMembershipDecisionAction {
    ACCEPTED
    REJECTED
  }

  enum CommitteeMembershipRequestType {
    COMMITTEE_MEMBER
    COMMITTEE_ADMIN
  }

  type CommitteeMembershipRequesterUserDetails {
    userId: Int!
    name: String!
    email: String!
    mobile: String
    dateOfBirth: String
    gender: String
    photo: String
  }

  type ReceivedCommitteeMembershipRequestItem {
    committeeId: Int!
    committeeName: String!
    committeeLogo: String
    address: String
    actionByUserId: Int
    resolvedByName: String
    resolvedByPhoto: String
    requestType: CommitteeMembershipRequestType!
    requestSentTime: String
    resolvedAtTime: String
    status: String!
    userDetails: CommitteeMembershipRequesterUserDetails!
  }

  type SentCommitteeMembershipRequestItem {
    committeeId: Int!
    committeeName: String!
    committeeLogo: String
    requesterUserId: Int!
    requesterName: String
    requesterEmail: String
    requesterPhoto: String
    actionByUserId: Int
    requestType: CommitteeMembershipRequestType!
    address: String
    establishYear: Int
    status: String!
    requestSentTime: String
    resolvedByName: String
    resolvedByEmail: String
    resolvedByPhoto: String
    resolvedAtTime: String
  }

  type ReceivedCommitteeMembershipRequestsResponse {
    data: [ReceivedCommitteeMembershipRequestItem!]!
  }

  type SentCommitteeMembershipRequestsResponse {
    data: [SentCommitteeMembershipRequestItem!]!
  }

  type TakeActionOnCommitteeMembershipRequestResponse {
    committeeId: Int!
    targetUserId: Int!
    actionAtTime: String!
    updatedMembershipStatus: String!
  }
`;

export const committeeMembershipRequestsQueryFields = `
  receivedCommitteeMembershipRequestsForAdminCommittees: ReceivedCommitteeMembershipRequestsResponse!
  sentCommitteeMembershipRequestsByLoggedInUser: SentCommitteeMembershipRequestsResponse!
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
    // ── Requests received by committees where logged-in user is admin ──────────
    async receivedCommitteeMembershipRequestsForAdminCommittees(_: any, __: any, context: any) {
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);

      const rows = await query<any[]>(
        `SELECT
            c.id                                            AS committee_id,
            c.committee_name,
            c.logo                                          AS committee_logo,
            c.address,
            crr.action_by_user_id,
            action_user.name                                AS resolved_by_name,
            action_user.profile_photo                       AS resolved_by_photo,
            crr.request_role                                AS request_type,
            DATE_FORMAT(crr.requested_at, '%Y-%m-%d %H:%i:%s') AS request_sent_time,
            crr.status,
            DATE_FORMAT(crr.action_at, '%Y-%m-%d %H:%i:%s')    AS resolved_at_time,
            u.id                                           AS user_id,
            u.name,
            u.email,
            u.mobile,
            u.date_of_birth,
            u.gender,
            u.profile_photo                                AS photo
         FROM committee_role_requests crr
         INNER JOIN committees c ON c.id = crr.committee_id
         INNER JOIN users u ON u.id = crr.requester_user_id
         LEFT JOIN users action_user ON action_user.id = crr.action_by_user_id
         INNER JOIN users_committees admin_uc
            ON admin_uc.committee_id = crr.committee_id
            AND admin_uc.user_id = ?
            AND admin_uc.committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         WHERE crr.status IN ('PENDING', 'ACCEPTED', 'REJECTED')
           AND crr.requester_user_id <> ?
         ORDER BY crr.requested_at DESC`,
        [loggedInUserId, loggedInUserId]
      );

      return {
        data: rows.map((row) => ({
          committeeId: Number(row.committee_id),
          committeeName: row.committee_name,
          committeeLogo: row.committee_logo || null,
          address: row.address,
          actionByUserId: row.action_by_user_id ? Number(row.action_by_user_id) : null,
          resolvedByName: row.resolved_by_name,
          resolvedByPhoto: row.resolved_by_photo,
          requestType: row.request_type as 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN',
          requestSentTime: row.request_sent_time,
          resolvedAtTime: row.resolved_at_time || null,
          status: String(row.status),
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
    },

    // ── Requests sent by the logged-in user ────────────────────────────────────
    async sentCommitteeMembershipRequestsByLoggedInUser(_: any, __: any, context: any) {
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);

      const rows = await query<any[]>(
        `SELECT
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
         INNER JOIN committees c ON c.id = crr.committee_id
         INNER JOIN users requester_user ON requester_user.id = crr.requester_user_id
         LEFT JOIN users action_user ON action_user.id = COALESCE(crr.action_by_user_id, crr.cancel_by_user_id)
         WHERE crr.requester_user_id = ?
           AND (
             crr.status = 'CANCELLED'
             OR crr.action_by_user_id IS NULL
             OR crr.action_by_user_id <> crr.requester_user_id
           )
         ORDER BY crr.requested_at DESC`,
        [loggedInUserId]
      );

      return {
        data: rows.map((row) => ({
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
  },

  Mutation: {
    // ── Admin accepts/rejects a pending request ────────────────────────────────
    async takeActionOnCommitteeMembershipRequest(
      _: any,
      args: { committeeId: number; targetUserId: number; decisionAction: 'ACCEPTED' | 'REJECTED' },
      context: any
    ) {
      const { committeeId, targetUserId, decisionAction } = args;
      const resolvedDecisionStatus = decisionAction === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED';
      const loggedInUserId = await resolveLoggedInUserIdFromGraphQLContext(context);
      const actionAtTime = new Date().toISOString();

      // Verify actor is an accepted admin
      const adminValidationRows = await query<any[]>(
        `SELECT user_id FROM users_committees
         WHERE committee_id = ?
           AND user_id = ?
           AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         LIMIT 1`,
        [committeeId, loggedInUserId]
      );
      if (adminValidationRows.length === 0) {
        throw new Error('Forbidden: Only accepted committee admins can take membership actions');
      }

      // Find the latest PENDING request for this user in this committee
      const pendingRows = await query<any[]>(
        `SELECT id, request_role FROM committee_role_requests
         WHERE committee_id = ? AND requester_user_id = ? AND status = 'PENDING'
         ORDER BY requested_at DESC
         LIMIT 1`,
        [committeeId, targetUserId]
      );
      if (pendingRows.length === 0) {
        throw new Error('No pending membership request found for this user and committee');
      }

      const { id: requestId, request_role: requestRole } = pendingRows[0];

      // Update request status
      await execute(
        `UPDATE committee_role_requests
         SET status = ?, action_by_user_id = ?, action_at = NOW()
         WHERE id = ?`,
        [resolvedDecisionStatus, loggedInUserId, requestId]
      );

      // Update or insert final state in users_committees
      if (decisionAction === 'ACCEPTED') {
        if (requestRole === 'COMMITTEE_ADMIN') {
          await execute(
            `INSERT INTO users_committees (committee_id, user_id, committee_role, is_favourite)
             VALUES (?, ?, 'COMMITTEE_ADMIN', 0)
             ON DUPLICATE KEY UPDATE
               is_favourite = 0,
               committee_role = CASE
                 WHEN committee_role = 'COMMITTEE_MASTER_ADMIN' THEN 'COMMITTEE_MASTER_ADMIN'
                 ELSE 'COMMITTEE_ADMIN'
               END`,
            [committeeId, targetUserId]
          );
        } else {
          await execute(
            `INSERT INTO users_committees (committee_id, user_id, committee_role, is_favourite)
             VALUES (?, ?, 'COMMITTEE_MEMBER', 0)
             ON DUPLICATE KEY UPDATE
               is_favourite = 0,
               committee_role = CASE
                 WHEN committee_role = 'COMMITTEE_MASTER_ADMIN' THEN 'COMMITTEE_MASTER_ADMIN'
                 WHEN committee_role = 'COMMITTEE_ADMIN' THEN 'COMMITTEE_ADMIN'
                 ELSE 'COMMITTEE_MEMBER'
               END`,
            [committeeId, targetUserId]
          );
        }
      } else {
        // REJECTED — ensure row exists but not promoted
        await execute(
          `INSERT INTO users_committees (committee_id, user_id, committee_role, is_favourite)
           VALUES (?, ?, NULL, 0)
           ON DUPLICATE KEY UPDATE committee_id = committee_id`,
          [committeeId, targetUserId]
        );
      }

      return {
        committeeId,
        targetUserId,
        actionAtTime,
        updatedMembershipStatus: resolvedDecisionStatus
      };
    }
  }
};