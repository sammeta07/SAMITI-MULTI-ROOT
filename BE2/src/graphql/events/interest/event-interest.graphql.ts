import { query } from '../../../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { throwEventError, getLoggedInUserId } from '../voting/event-voting.graphql';

export interface EventInterestPerson {
  userId: number;
  name: string;
  email: string;
  photo: string | null;
}

export async function getEventInterestApprovedPeople(
  eventId: number,
  roleId: number
): Promise<EventInterestPerson[]> {
  const rows = await query<Array<RowDataPacket & {
    userId: number;
    name: string;
    email: string;
    photo: string | null;
  }>>(
    `SELECT
        u.id AS userId,
        u.name AS name,
        u.email AS email,
        u.profile_photo AS photo
      FROM event_interest_expressions eie
      INNER JOIN users u ON u.id = eie.user_id
      WHERE eie.event_id = ?
        AND eie.role_id = ?
        AND eie.status = 'APPROVED'
      ORDER BY u.name ASC`,
    [eventId, roleId]
  );

  return rows.map((row) => ({
    userId: Number(row.userId),
    name: String(row.name || ''),
    email: String(row.email || ''),
    photo: row.photo ? String(row.photo) : null
  }));
}

export async function getMyEventInterestRoleIds(eventId: number, userId: number): Promise<Set<number>> {
  const rows = await query<Array<RowDataPacket & { roleId: number; status: string }>>(
    `SELECT role_id AS roleId, status
      FROM event_interest_expressions
      WHERE event_id = ? AND user_id = ? AND status IN ('PENDING', 'APPROVED')`,
    [eventId, userId]
  );

  return new Set(rows.map((row) => Number(row.roleId)));
}

export async function getMyEventInterestStatuses(eventId: number, userId: number): Promise<Array<{ roleId: number; status: string }>> {
  const rows = await query<Array<RowDataPacket & { roleId: number; status: string }>>(
    `SELECT role_id AS roleId, status
      FROM event_interest_expressions
      WHERE event_id = ? AND user_id = ? AND status IN ('PENDING', 'APPROVED')`,
    [eventId, userId]
  );

  return rows.map((row) => ({ roleId: Number(row.roleId), status: String(row.status || 'PENDING') }));
}

export const eventInterestTypes = `
  type EventInterestPerson {
    userId: Int!
    name: String!
    email: String!
    photo: String
  }

  type EventInterestInfo {
    roleId: Int!
    approvedPeople: [EventInterestPerson!]!
  }

  type EventInterestStatus {
    roleId: Int!
    status: String!
  }

  type ExpressEventInterestPayload {
    eventId: Int!
    roleId: Int!
    expressed: Boolean!
    myInterestRoleIds: [Int!]!
    myInterestStatuses: [EventInterestStatus!]!
  }

  type ReviewEventInterestPayload {
    eventId: Int!
    roleId: Int!
    userId: Int!
    status: String!
    autoRejectedOthers: Boolean
    previousDesignation: String
  }

  type PendingEventInterest {
    id: Int!
    eventId: Int!
    roleId: Int!
    roleName: String
    userId: Int!
    userName: String!
    userEmail: String!
    userPhoto: String
    status: String!
    createdAt: String
  }

  type EventInterestSummary {
    eventId: Int!
    pending: [PendingEventInterest!]!
  }
`;

export const eventInterestQueryFields = `
  pendingEventInterests(eventId: Int!): EventInterestSummary!
`;

export const eventInterestMutationFields = `
  expressEventInterest(eventId: Int!, roleId: Int!): ExpressEventInterestPayload!
  reviewEventInterest(eventId: Int!, roleId: Int!, userId: Int!, status: String!): ReviewEventInterestPayload!
`;

interface EventAccessContext {
  eventExists: boolean;
  isCommitteeMember: boolean;
  committeeRole: string;
  isMasterAdmin: boolean;
  votingPhaseState: number;
}

async function getEventAccessContext(eventId: number, userId: number): Promise<EventAccessContext> {
  const rows = await query<Array<RowDataPacket & {
    committeeRole: string | null;
    votingPhaseState: number;
  }>>(
    `SELECT
        c.committee_role AS committeeRole,
        COALESCE(e.voting_phase_state, 0) AS votingPhaseState
      FROM events e
      LEFT JOIN users_committees c ON c.committee_id = e.committee_id AND c.user_id = ?
      WHERE e.id = ?
      LIMIT 1`,
    [userId, eventId]
  );

  if (!rows.length) {
    return {
      eventExists: false,
      isCommitteeMember: false,
      committeeRole: '',
      isMasterAdmin: false,
      votingPhaseState: 0
    };
  }

  const committeeRole = String(rows[0].committeeRole || '').toUpperCase();

  return {
    eventExists: true,
    isCommitteeMember: committeeRole.length > 0,
    committeeRole,
    isMasterAdmin: committeeRole === 'COMMITTEE_MASTER_ADMIN',
    votingPhaseState: Number(rows[0].votingPhaseState || 0)
  };
}

async function requireMappedRole(eventId: number, roleId: number): Promise<void> {
  const roleRows = await query<Array<RowDataPacket & { roleId: number }>>(
    `SELECT evr.role_id AS roleId
      FROM event_voting_roles evr
      WHERE evr.event_id = ? AND evr.role_id = ?
      LIMIT 1`,
    [eventId, roleId]
  );

  if (roleRows.length === 0) {
    throwEventError('BAD_REQUEST', 'Selected role is not part of this event');
  }
}

export const eventInterestResolvers = {
  Query: {
    async pendingEventInterests(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      let loggedInUserId = 0;
      try {
        loggedInUserId = await getLoggedInUserId(context);
      } catch {
        return { eventId, pending: [] };
      }

      const access = await getEventAccessContext(eventId, loggedInUserId);
      // Master admin can always view pending interests.
      // Other committee members (ADMIN / MEMBER) can view once roles are locked (votingPhaseState >= 1).
      const canViewPending =
        access.isMasterAdmin ||
        (access.isCommitteeMember && access.votingPhaseState >= 1);
      if (!canViewPending) {
        return { eventId, pending: [] };
      }

      const pendingRows = await query<Array<RowDataPacket & {
        id: number;
        eventId: number;
        roleId: number;
        roleName: string | null;
        userId: number;
        userName: string;
        userEmail: string;
        userPhoto: string | null;
        status: string;
        createdAt: string;
      }>>(
        `SELECT
            eie.id AS id,
            eie.event_id AS eventId,
            eie.role_id AS roleId,
            erm.role_name AS roleName,
            eie.user_id AS userId,
            u.name AS userName,
            u.email AS userEmail,
            u.profile_photo AS userPhoto,
            eie.status AS status,
            DATE_FORMAT(eie.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
           FROM event_interest_expressions eie
           INNER JOIN users u ON u.id = eie.user_id
           LEFT JOIN events_roles_master erm ON erm.role_id = eie.role_id
           WHERE eie.event_id = ?
           ORDER BY eie.created_at ASC`,
         [eventId]
      );

      return {
        eventId,
        pending: pendingRows.map((row) => ({
          id: Number(row.id),
          eventId: Number(row.eventId),
          roleId: Number(row.roleId),
          roleName: row.roleName ? String(row.roleName) : null,
          userId: Number(row.userId),
          userName: String(row.userName || ''),
          userEmail: String(row.userEmail || ''),
          userPhoto: row.userPhoto ? String(row.userPhoto) : null,
          status: String(row.status || 'PENDING'),
          createdAt: row.createdAt || null
        }))
      };
    }
  },
  Mutation: {
    async expressEventInterest(_: any, args: { eventId: number; roleId: number }, context: any) {
      const eventId = Number(args?.eventId);
      const roleId = Number(args?.roleId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }
      if (!Number.isInteger(roleId) || roleId <= 0) {
        throwEventError('BAD_REQUEST', 'roleId must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & { id: number }>>(
        `SELECT id FROM events WHERE id = ? LIMIT 1`,
        [eventId]
      );
      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      await requireMappedRole(eventId, roleId);

      const existingRows = await query<Array<RowDataPacket & { id: number; status: string }>>(
        `SELECT id, status FROM event_interest_expressions
          WHERE event_id = ? AND role_id = ? AND user_id = ?
          LIMIT 1`,
        [eventId, roleId, loggedInUserId]
      );

      let expressed = false;
      if (existingRows.length > 0) {
        const current = existingRows[0];
        if (String(current.status).toUpperCase() === 'REJECTED') {
          await query(
            `UPDATE event_interest_expressions
              SET status = 'PENDING', reviewed_by = NULL, reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [current.id]
          );
          expressed = true;
        } else {
          await query(
            `DELETE FROM event_interest_expressions WHERE id = ?`,
            [current.id]
          );
          expressed = false;
        }
      } else {
        await query(
          `INSERT INTO event_interest_expressions (event_id, role_id, user_id, status)
            VALUES (?, ?, ?, 'PENDING')`,
          [eventId, roleId, loggedInUserId]
        );
        expressed = true;
      }

      const myStatusRows = await query<Array<RowDataPacket & { roleId: number; status: string }>>(
        `SELECT role_id AS roleId, status
          FROM event_interest_expressions
          WHERE event_id = ? AND user_id = ? AND status IN ('PENDING', 'APPROVED')`,
        [eventId, loggedInUserId]
      );

      return {
        eventId,
        roleId,
        expressed,
        myInterestRoleIds: myStatusRows.map((row) => Number(row.roleId)),
        myInterestStatuses: myStatusRows.map((row) => ({ roleId: Number(row.roleId), status: String(row.status || 'PENDING') }))
      };
    },

    async reviewEventInterest(
      _: any,
      args: { eventId: number; roleId: number; userId: number; status: string },
      context: any
    ) {
      const eventId = Number(args?.eventId);
      const roleId = Number(args?.roleId);
      const targetUserId = Number(args?.userId);
      const status = String(args?.status || '').toUpperCase();

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }
      if (!Number.isInteger(roleId) || roleId <= 0) {
        throwEventError('BAD_REQUEST', 'roleId must be a positive integer');
      }
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        throwEventError('BAD_REQUEST', 'userId must be a positive integer');
      }
      if (!['APPROVED', 'REJECTED'].includes(status)) {
        throwEventError('BAD_REQUEST', "status must be either 'APPROVED' or 'REJECTED'");
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const access = await getEventAccessContext(eventId, loggedInUserId);
      if (!access.eventExists) {
        throwEventError('NOT_FOUND', 'Event not found');
      }
      if (!access.isMasterAdmin) {
        throwEventError('FORBIDDEN', 'Only the master admin can review interest expressions');
      }
      // Approve/Reject is only allowed during the review phase (votingPhaseState === 3).
      if (access.votingPhaseState !== 3) {
        throwEventError('BAD_REQUEST', 'Interest can only be reviewed while voting phase state is 3');
      }
      await requireMappedRole(eventId, roleId);

      const existingRows = await query<Array<RowDataPacket & { id: number }>>(
        `SELECT id FROM event_interest_expressions
          WHERE event_id = ? AND role_id = ? AND user_id = ?
          LIMIT 1`,
        [eventId, roleId, targetUserId]
      );
      if (existingRows.length === 0) {
        throwEventError('NOT_FOUND', 'No interest expression found for this user and role');
      }

      if (status === 'APPROVED') {
        // If the user is already approved for a different designation, the
        // master admin is allowed to change it: auto-reject the previously
        // approved role (and any other pending roles) so the member ends up
        // approved for exactly one designation.
        const previousApproved = await query<Array<RowDataPacket & {
          roleId: number;
          roleName: string | null;
        }>>(
          `SELECT eie.role_id AS roleId, erm.role_name AS roleName
            FROM event_interest_expressions eie
            LEFT JOIN events_roles_master erm ON erm.role_id = eie.role_id
            WHERE eie.event_id = ? AND eie.user_id = ? AND eie.status = 'APPROVED' AND eie.role_id <> ?
            LIMIT 1`,
          [eventId, targetUserId, roleId]
        );

        await query(
          `UPDATE event_interest_expressions
            SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [status, loggedInUserId, existingRows[0].id]
        );

        const rejectResult = await query(
          `UPDATE event_interest_expressions
            SET status = 'REJECTED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE event_id = ? AND user_id = ? AND role_id <> ? AND (status = 'PENDING' OR status = 'APPROVED')`,
          [loggedInUserId, eventId, targetUserId, roleId]
        ) as unknown as ResultSetHeader;

        if (rejectResult.affectedRows > 0 || previousApproved.length > 0) {
          const previousName = previousApproved.length > 0
            ? (previousApproved[0].roleName || `Role ${previousApproved[0].roleId}`)
            : null;
          return {
            eventId,
            roleId,
            userId: targetUserId,
            status,
            autoRejectedOthers: true,
            previousDesignation: previousName
          };
        }

        return {
          eventId,
          roleId,
          userId: targetUserId,
          status
        };
      }

      await query(
        `UPDATE event_interest_expressions
          SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [status, loggedInUserId, existingRows[0].id]
      );

      return {
        eventId,
        roleId,
        userId: targetUserId,
        status
      };
    }
  }
};
