import { query } from '../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsDisplayNameColumn } from './event-display-name-support';
import { hasEventsVotingPhaseStateColumn } from '../voting/event-voting-phase-support';
import { hasEventsVotingModeColumn } from '../voting/event-voting-mode-support';
import { throwEventError, getLoggedInUserId, getEventVotingPhaseState } from '../voting/event-voting.graphql';

export const eventProgramsTypes = `
  type EventProgramsPayload {
    eventId: Int!
    programs: [EventProgramSummary!]!
  }
`;

export const eventProgramsQueryFields = `
  eventPrograms(id: Int!): EventProgramsPayload!
`;

export const eventProgramsResolvers = {
  Query: {
    async eventPrograms(_: any, args: { id: number }, context: any) {
      const eventId = Number(args?.id);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'id must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const supportsEventDisplayName = await hasEventsDisplayNameColumn();
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      const supportsVotingMode = await hasEventsVotingModeColumn();

      const eventResult = await query<any[]>(`
        SELECT
          e.id,
          e.id AS eventId,
          e.committee_id AS committeeId,
          c.address AS committeeAddress,
          e.name AS eventName,
          ${supportsEventDisplayName ? "COALESCE(NULLIF(TRIM(e.display_name), ''), LEFT(e.name, 20))" : 'LEFT(e.name, 20)'} AS eventDisplayName,
          e.address,
          e.status,
          e.category,
          e.visibility,
          e.type,
          DATE_FORMAT(e.start_date, '%Y-%m-%d') AS startDate,
          DATE_FORMAT(e.end_date, '%Y-%m-%d') AS endDate,
          e.latitude,
          e.longitude,
          e.created_by AS createdBy,
          e.updated_by AS updatedBy,
          e.created_at AS createdAt
           ${supportsVotingPhaseState ? ', COALESCE(e.voting_phase_state, 0) AS votingPhaseState' : ', 0 AS votingPhaseState'}
           ${supportsVotingMode ? ', e.voting_mode AS votingMode' : ", 'VOTING' AS votingMode"}
        FROM events e
        LEFT JOIN committees c ON c.id = e.committee_id
        WHERE e.id = ?
        LIMIT 1
      `, [eventId]);

      if (!eventResult || eventResult.length === 0) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventResult[0];
      const visibility = String(event.visibility || '').toUpperCase();

      const committeeMembership = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const membership = committeeMembership[0];
      const hasCommitteeAccess = Boolean(
        membership &&
        (
          String(membership.committee_role || '') === 'COMMITTEE_MEMBER' ||
          String(membership.committee_role || '') === 'COMMITTEE_ADMIN' ||
          String(membership.committee_role || '') === 'COMMITTEE_MASTER_ADMIN'
        )
      );

      if (visibility === 'HIDDEN' && !hasCommitteeAccess) {
        throwEventError('FORBIDDEN', 'You are not allowed to access this event');
      }

      const programRows = await query<Array<RowDataPacket & {
        id: number;
        programId: number;
        programName: string;
        status: string;
        visibility: string;
        startDate: string | null;
        endDate: string | null;
        programBanner: string | null;
      }>>(
        `SELECT
           p.id,
           p.id AS programId,
           p.name AS programName,
           p.status,
           p.visibility,
           DATE_FORMAT(p.start_date_time, '%Y-%m-%d %H:%i:%s') AS startDate,
           DATE_FORMAT(p.end_date_time, '%Y-%m-%d %H:%i:%s') AS endDate,
           (
             SELECT pma.media_url
             FROM program_media_assets pma
             WHERE pma.program_id = p.id
             ORDER BY pma.sort_order ASC, pma.id ASC
             LIMIT 1
           ) AS programBanner
         FROM programs p
         WHERE p.event_id = ?
         ORDER BY p.name ASC`,
        [eventId]
      );

      return {
        eventId: Number(event.eventId),
        programs: programRows.map((programRow) => ({
          id: Number(programRow.id),
          programId: Number(programRow.programId),
          programName: String(programRow.programName || ''),
          status: String(programRow.status || ''),
          visibility: String(programRow.visibility || ''),
          startDate: programRow.startDate,
          endDate: programRow.endDate,
          programBanner: programRow.programBanner || null
        }))
      };
    }
  }
};
