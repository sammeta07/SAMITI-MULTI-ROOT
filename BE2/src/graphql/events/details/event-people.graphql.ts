import { query } from '../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsDisplayNameColumn } from './event-display-name-support';
import { hasEventsVotingPhaseStateColumn } from '../voting/event-voting-phase-support';
import { hasEventsVotingModeColumn } from '../voting/event-voting-mode-support';
import { throwEventError, getLoggedInUserId, getEventVotingPhaseState } from '../voting/event-voting.graphql';

export const eventPeopleTypes = `
  type EventPeoplePayload {
    eventId: Int!
    eventParticipants: [EventParticipant!]!
  }
`;

export const eventPeopleQueryFields = `
  eventPeople(id: Int!): EventPeoplePayload!
`;

export const eventPeopleResolvers = {
  Query: {
    async eventPeople(_: any, args: { id: number }, context: any) {
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

      const eventParticipantRows = await query<Array<RowDataPacket & {
        userId: number;
        name: string;
        email: string;
        photo: string | null;
        designation: string;
        membershipStatus: string;
      }>>(
        `SELECT
           ue.user_id AS userId,
           u.name,
           u.email,
           u.profile_photo AS photo,
           UPPER(COALESCE(NULLIF(TRIM(ue.designation), ''), 'MEMBER')) AS designation,
           UPPER(COALESCE(NULLIF(TRIM(ue.status), ''), 'ACTIVE')) AS membershipStatus
         FROM users_events ue
         INNER JOIN users u ON u.id = ue.user_id
         WHERE ue.event_id = ?
         ORDER BY designation ASC, u.name ASC`,
        [eventId]
      );

      return {
        eventId: Number(event.eventId),
        eventParticipants: eventParticipantRows.map((participantRow) => ({
          userId: Number(participantRow.userId),
          name: String(participantRow.name || ''),
          email: String(participantRow.email || ''),
          photo: participantRow.photo || null,
          designation: String(participantRow.designation || 'MEMBER'),
          membershipStatus: String(participantRow.membershipStatus || 'ACTIVE')
        }))
      };
    }
  }
};
