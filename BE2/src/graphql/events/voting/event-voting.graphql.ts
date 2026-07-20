import { query } from '../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsVotingPhaseStateColumn } from './event-voting-phase-support';

export async function hasEventsVotingEnabledColumn(): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT 1 AS column_exists
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'events'
       AND COLUMN_NAME = 'voting_enabled'
     LIMIT 1`
  );

  return rows.length > 0;
}

export async function hasEventsVotingClosedColumn(): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT 1 AS column_exists
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'events'
       AND COLUMN_NAME = 'voting_closed'
     LIMIT 1`
  );

  return rows.length > 0;
}

export function throwEventError(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function getAccessToken(context: any): string {
  const authHeader = context.headers?.authorization;
  const tokenFromCookie = context.cookies?.token;

  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  if (typeof tokenFromCookie === 'string' && tokenFromCookie.trim().length > 0) {
    return tokenFromCookie.trim();
  }

  return '';
}

export async function getLoggedInUserId(context: any): Promise<number> {
  const accessToken = getAccessToken(context);
  if (!accessToken) {
    throwEventError('UNAUTHORIZED', 'Missing access token');
  }

  try {
    const decoded: any = await context.jwt.verify(accessToken);
    const loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);

    if (!Number.isInteger(loggedInUserId) || loggedInUserId <= 0) {
      throwEventError('UNAUTHORIZED', 'Invalid token payload');
    }

    return loggedInUserId;
  } catch {
    throwEventError('UNAUTHORIZED', 'Invalid or expired token');
  }
}

export function getEventVotingPhaseState(event: any, supportsVotingPhaseState: boolean): number {
  if (supportsVotingPhaseState) {
    return Number(event?.votingPhaseState || 0);
  }

  if (Number(event?.votingClosed || 0) === 1) {
    return 4;
  }

  if (Number(event?.votingEnabled || 0) === 1) {
    return 3;
  }

  return 0;
}

export async function getMappedVotingRoles(eventId: number): Promise<Array<{
  roleId: number;
  roleName: string;
  hindiName: string | null;
  englishName: string | null;
  sortOrder: number;
}>> {
  const mappedVotingRoleRows = await query<Array<RowDataPacket & {
    roleId: number;
    roleName: string;
    hindiName: string | null;
    englishName: string | null;
    sortOrder: number;
  }>>(
    `SELECT
       evr.role_id AS roleId,
       erm.role_name AS roleName,
       erm.hindi_name AS hindiName,
       erm.english_name AS englishName,
       COALESCE(erm.sort_order, 0) AS sortOrder
     FROM event_voting_roles evr
     INNER JOIN events_roles_master erm ON erm.role_id = evr.role_id
     WHERE evr.event_id = ?
     ORDER BY COALESCE(erm.sort_order, 0) ASC, erm.role_name ASC`,
    [eventId]
  );

  return mappedVotingRoleRows.map((mappedRoleRow) => ({
    roleId: Number(mappedRoleRow.roleId),
    roleName: String(mappedRoleRow.roleName || ''),
    hindiName: mappedRoleRow.hindiName ? String(mappedRoleRow.hindiName) : null,
    englishName: mappedRoleRow.englishName ? String(mappedRoleRow.englishName) : null,
    sortOrder: Number(mappedRoleRow.sortOrder || 0)
  }));
}

export const eventVotingTypes = `
  type EventMappedVotingRole {
    roleId: Int!
    roleName: String!
    hindiName: String
    englishName: String
    sortOrder: Int!
  }

  type ToggleEventVotingRolePayload {
    eventId: Int!
    roleId: Int!
    enabled: Boolean!
    mappedVotingRoles: [EventMappedVotingRole!]!
  }

  type LockEventVotingRolesPayload {
    eventId: Int!
    votingPhaseState: Int!
  }

  type UnlockEventVotingRolesPayload {
    eventId: Int!
    votingPhaseState: Int!
  }

  type StartEventNominationsPayload {
    eventId: Int!
    votingPhaseState: Int!
  }

  type StopEventNominationsPayload {
    eventId: Int!
    votingPhaseState: Int!
  }

  type AllowEventVotingPayload {
    eventId: Int!
    votingEnabled: Boolean!
  }

  type StopEventVotingPayload {
    eventId: Int!
    votingClosed: Boolean!
  }

  type DeclareEventResultsPayload {
    eventId: Int!
    votingPhaseState: Int!
  }
`;

export const eventVotingMutationFields = `
  toggleEventVotingRole(eventId: Int!, roleId: Int!, enabled: Boolean!): ToggleEventVotingRolePayload!
  lockEventVotingRoles(eventId: Int!): LockEventVotingRolesPayload!
  unlockEventVotingRoles(eventId: Int!): UnlockEventVotingRolesPayload!
  startEventNominations(eventId: Int!): StartEventNominationsPayload!
  stopEventNominations(eventId: Int!): StopEventNominationsPayload!
  allowEventVoting(eventId: Int!): AllowEventVotingPayload!
  stopEventVoting(eventId: Int!): StopEventVotingPayload!
  declareEventResults(eventId: Int!): DeclareEventResultsPayload!
`;

export const eventVotingResolvers = {
  Mutation: {
    async toggleEventVotingRole(_: any, args: { eventId: number; roleId: number; enabled: boolean }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const roleId = Number(args?.roleId);
      if (!Number.isInteger(roleId) || roleId <= 0) {
        throwEventError('BAD_REQUEST', 'roleId must be a positive integer');
      }

      const enabled = Boolean(args?.enabled);

      const loggedInUserId = await getLoggedInUserId(context);
      const supportsVotingEnabled = await hasEventsVotingEnabledColumn();
      const supportsVotingClosed = await hasEventsVotingClosedColumn();
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();

      const eventRows = await query<any[]>(
        `SELECT
           id,
           committee_id AS committeeId,
           ${supportsVotingEnabled ? 'COALESCE(voting_enabled, 0)' : '0'} AS votingEnabled,
           ${supportsVotingClosed ? 'COALESCE(voting_closed, 0)' : '0'} AS votingClosed,
           ${supportsVotingPhaseState ? 'COALESCE(voting_phase_state, 0)' : '0'} AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(
        membershipRows[0] && (
          String(membershipRows[0].committee_role || '') === 'COMMITTEE_ADMIN' ||
          String(membershipRows[0].committee_role || '') === 'COMMITTEE_MASTER_ADMIN'
        )
      );
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can configure event voting roles');
      }

      if (Number(event.votingPhaseState || 0) >= 1) {
        throwEventError('FORBIDDEN', 'Voting role selection is locked for this event and cannot be changed');
      }

      if (Number(event.votingEnabled || 0) === 1) {
        throwEventError('FORBIDDEN', 'Voting is already enabled for this event; role selection cannot be changed');
      }

      if (Number(event.votingClosed || 0) === 1) {
        throwEventError('FORBIDDEN', 'Voting has been closed for this event; role selection cannot be changed');
      }

      const validRoleRows = await query<Array<RowDataPacket & { roleId: number }>>(
        `SELECT role_id AS roleId
         FROM events_roles_master
         WHERE is_active = 1
           AND role_id = ?`,
        [roleId]
      );

      if (validRoleRows.length === 0) {
        throwEventError('BAD_REQUEST', 'Selected role is invalid or inactive');
      }

      if (enabled) {
        await query(
          `INSERT IGNORE INTO event_voting_roles (event_id, role_id, created_by)
           VALUES (?, ?, ?)`,
          [eventId, roleId, loggedInUserId]
        );
      } else {
        await query(
          `DELETE FROM event_voting_roles WHERE event_id = ? AND role_id = ?`,
          [eventId, roleId]
        );
      }

      const mappedVotingRoleRows = await getMappedVotingRoles(eventId);

      return {
        eventId,
        roleId,
        enabled,
        mappedVotingRoles: mappedVotingRoleRows
      };
    },

    async lockEventVotingRoles(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingEnabled = await hasEventsVotingEnabledColumn();
      const supportsVotingClosed = await hasEventsVotingClosedColumn();
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingEnabled) {
        throwEventError('INTERNAL', 'Voting enabled column is missing. Please run latest migrations.');
      }
      if (!supportsVotingClosed) {
        throwEventError('INTERNAL', 'Voting closed column is missing. Please run latest migrations.');
      }
      if (!supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase state column is missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingEnabled: number;
        votingClosed: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_enabled, 0) AS votingEnabled,
           COALESCE(voting_closed, 0) AS votingClosed,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can lock voting role selection');
      }

      if (Number(event.votingPhaseState || 0) === 0) {
        await query(
          `UPDATE events
           SET voting_phase_state = 1,
               voting_enabled = 0,
               voting_closed = 0,
               updated_by = ?
           WHERE id = ?`,
          [loggedInUserId, eventId]
        );
      }

      return {
        eventId,
        votingPhaseState: 1
      };
    },

    async startEventNominations(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase columns are missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can start nominations');
      }

      if (Number(event.votingPhaseState || 0) < 1) {
        throwEventError('BAD_REQUEST', 'Lock voting roles before starting nominations');
      }

      if (Number(event.votingPhaseState || 0) !== 1) {
        throwEventError('BAD_REQUEST', 'Nominations have already been started for this event');
      }

      await query(
        `UPDATE events
         SET voting_phase_state = 1,
             updated_by = ?
         WHERE id = ?`,
        [loggedInUserId, eventId]
      );

      return {
        eventId,
        votingPhaseState: 1
      };
    },

    async stopEventNominations(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase state column is missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can stop nominations');
      }

      if (Number(event.votingPhaseState || 0) !== 1) {
        throwEventError('BAD_REQUEST', 'Nominations are not active for this event');
      }

      await query(
        `UPDATE events
         SET voting_phase_state = 2,
             updated_by = ?
         WHERE id = ?`,
        [loggedInUserId, eventId]
      );

      return {
        eventId,
        votingPhaseState: 2
      };
    },

    async unlockEventVotingRoles(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase state column is missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can unlock voting role selection');
      }

      if (Number(event.votingPhaseState || 0) !== 1) {
        throwEventError('BAD_REQUEST', 'Voting role selection can only be unlocked before nominations progress');
      }

      await query(
        `UPDATE events
         SET voting_phase_state = 0,
             updated_by = ?
         WHERE id = ?`,
        [loggedInUserId, eventId]
      );

      return {
        eventId,
        votingPhaseState: 0
      };
    },

    async allowEventVoting(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingEnabled = await hasEventsVotingEnabledColumn();
      const supportsVotingClosed = await hasEventsVotingClosedColumn();
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingEnabled || !supportsVotingClosed || !supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase columns are missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingEnabled: number;
        votingClosed: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_enabled, 0) AS votingEnabled,
           COALESCE(voting_closed, 0) AS votingClosed,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can allow voting');
      }

      if (Number(event.votingPhaseState || 0) < 1) {
        throwEventError('BAD_REQUEST', 'Lock voting roles before allowing voting');
      }

      if (Number(event.votingPhaseState || 0) !== 2) {
        throwEventError('BAD_REQUEST', 'Stop nominations before starting voting');
      }

      if (Number(event.votingEnabled || 0) !== 1) {
        await query(
          `UPDATE events
           SET voting_enabled = 1,
               voting_closed = 0,
               voting_phase_state = 3,
               updated_by = ?
           WHERE id = ?`,
          [loggedInUserId, eventId]
        );
      }

      return {
        eventId,
        votingEnabled: true
      };
    },

    async stopEventVoting(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingEnabled = await hasEventsVotingEnabledColumn();
      const supportsVotingClosed = await hasEventsVotingClosedColumn();
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingEnabled || !supportsVotingClosed || !supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase columns are missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingEnabled: number;
        votingClosed: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_enabled, 0) AS votingEnabled,
           COALESCE(voting_closed, 0) AS votingClosed,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can stop voting');
      }

      if (Number(event.votingEnabled || 0) !== 1) {
        throwEventError('BAD_REQUEST', 'Voting is not active for this event');
      }

      if (Number(event.votingPhaseState || 0) !== 3) {
        throwEventError('BAD_REQUEST', 'Voting must be started before it can be stopped');
      }

      await query(
        `UPDATE events
         SET voting_enabled = 0,
             voting_closed = 1,
             voting_phase_state = 4,
             updated_by = ?
         WHERE id = ?`,
        [loggedInUserId, eventId]
      );

      return {
        eventId,
        votingClosed: true
      };
    },

    async declareEventResults(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase columns are missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<Array<RowDataPacket & {
        id: number;
        committeeId: number;
        votingPhaseState: number;
      }>>(
        `SELECT
           id,
           committee_id AS committeeId,
           COALESCE(voting_phase_state, 0) AS votingPhaseState
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<Array<RowDataPacket & { isCommitteeAdmin: number }>>(
        `SELECT CASE WHEN committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') THEN 1 ELSE 0 END AS isCommitteeAdmin
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(membershipRows[0] && Number(membershipRows[0].isCommitteeAdmin) === 1);
      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can declare results');
      }

      if (Number(event.votingPhaseState || 0) !== 4) {
        throwEventError('BAD_REQUEST', 'Voting must be closed before declaring results');
      }

      await query(
        `UPDATE events
         SET voting_phase_state = 5,
             updated_by = ?
         WHERE id = ?`,
        [loggedInUserId, eventId]
      );

      return {
        eventId,
        votingPhaseState: 5
      };
    }
  }
};
