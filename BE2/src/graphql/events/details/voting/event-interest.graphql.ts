import { query } from '../../../../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { throwEventError, getLoggedInUserId } from './event-voting-core.graphql';

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
`;


export const eventInterestQueryFields = ``;

export const eventInterestMutationFields = `
  expressEventInterest(eventId: Int!, roleId: Int!, action: String!): ExpressEventInterestPayload!
  reviewEventInterest(eventId: Int!, roleId: Int!, userId: Int!, status: String!): ReviewEventInterestPayload!
`;

export interface EventAccessContext {
  eventExists: boolean;
  isCommitteeMember: boolean;
  committeeRole: string;
  isMasterAdmin: boolean;
  votingPhaseState: number;
}

export async function getEventAccessContext(eventId: number, userId: number): Promise<EventAccessContext> {
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
  Query: {},
  Mutation: {
    async expressEventInterest(_: any, args: { eventId: number; roleId: number; action: string }, context: any) {
      const eventId = Number(args?.eventId);
      const roleId = Number(args?.roleId);
      const action = String(args?.action || '').toUpperCase();
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }
      if (!Number.isInteger(roleId) || roleId <= 0) {
        throwEventError('BAD_REQUEST', 'roleId must be a positive integer');
      }
      if (!['INTERESTED', 'WITHDRAW'].includes(action)) {
        throwEventError('BAD_REQUEST', "action must be either 'INTERESTED' or 'WITHDRAW'");
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

      let expressed = false;
      if (action === 'INTERESTED') {
        const existingRows = await query<Array<RowDataPacket & { id: number; status: string }>>(
          `SELECT id, status FROM event_interest_expressions
            WHERE event_id = ? AND role_id = ? AND user_id = ?
            LIMIT 1`,
          [eventId, roleId, loggedInUserId]
        );

        if (existingRows.length > 0 && String(existingRows[0].status).toUpperCase() === 'REJECTED') {
          await query(
            `UPDATE event_interest_expressions
              SET status = 'PENDING', reviewed_by = NULL, reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [existingRows[0].id]
          );
        } else if (existingRows.length === 0) {
          await query(
            `INSERT INTO event_interest_expressions (event_id, role_id, user_id, status)
               VALUES (?, ?, ?, 'PENDING')`,
            [eventId, roleId, loggedInUserId]
          );

          await query(
            `INSERT INTO users_events (event_id, user_id, designation, status, created_at, updated_at)
             VALUES (?, ?, 'MEMBER', 'ACTIVE', NOW(), NOW())
             ON DUPLICATE KEY UPDATE updated_at = NOW()`,
            [eventId, loggedInUserId]
          );
        }
        expressed = true;
      } else {
        await query(
          `DELETE FROM event_interest_expressions WHERE event_id = ? AND role_id = ? AND user_id = ?`,
          [eventId, roleId, loggedInUserId]
        );
        expressed = false;
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
        const roleDisplayRow = await query<Array<RowDataPacket & { hindiName: string; englishName: string; roleName: string }>>(
          `SELECT hindi_name AS hindiName, english_name AS englishName, role_name AS roleName FROM events_roles_master WHERE role_id = ? AND is_active = 1 LIMIT 1`,
          [roleId]
        );
        const newDesignation = String(roleDisplayRow[0]?.hindiName || roleDisplayRow[0]?.englishName || roleDisplayRow[0]?.roleName || 'MEMBER').toUpperCase();

        await query(
          `INSERT INTO users_events (event_id, user_id, designation, status, created_at, updated_at)
           VALUES (?, ?, ?, 'ACTIVE', NOW(), NOW())
           ON DUPLICATE KEY UPDATE designation = VALUES(designation), updated_at = NOW()`,
          [eventId, targetUserId, newDesignation]
        );

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

      // If the currently approved designation is being rejected, restore any
      // previously auto-rejected requests for this user back to PENDING so
      // the user remains eligible for at least one designation.
      const wasApproved = await query<Array<RowDataPacket & { id: number }>>(
        `SELECT id FROM event_interest_expressions
          WHERE event_id = ? AND user_id = ? AND role_id = ? AND status = 'APPROVED'
          LIMIT 1`,
        [eventId, targetUserId, roleId]
      );

      await query(
        `UPDATE event_interest_expressions
          SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [status, loggedInUserId, existingRows[0].id]
      );

      if (wasApproved.length > 0) {
        await query(
          `UPDATE event_interest_expressions
            SET status = 'PENDING', reviewed_by = NULL, reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE event_id = ? AND user_id = ? AND status = 'REJECTED' AND reviewed_by = ? AND role_id <> ?`,
          [eventId, targetUserId, loggedInUserId, roleId]
        );
      }

      return {
        eventId,
        roleId,
        userId: targetUserId,
        status
      };
    }
  }
};
