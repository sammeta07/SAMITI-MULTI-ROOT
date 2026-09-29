import { query } from '../../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsDisplayNameColumn } from '../event-display-name-support';
import { throwEventError, getLoggedInUserId } from '../voting/event-voting-core.graphql';

export const eventDetailsHeaderTypes = `
  type EventDetailsHeader {
    id: Int!
    eventId: Int!
    committeeId: Int
    committeeAddress: String
    eventName: String!
    eventDisplayName: String!
    eventLogo: String
    category: String
    eventYear: Int
    type: String
    startDate: String
    endDate: String
    latitude: Float
    longitude: Float
    myDesignation: MyDesignation
    committeeRole: String
  }
`;

export const eventDetailsHeaderQueryFields = `
  eventDetailsHeader(id: Int!): EventDetailsHeader!
`;

export const eventDetailsHeaderResolvers = {
  Query: {
    async eventDetailsHeader(_: any, args: { id: number }, context: any) {
      const eventId = Number(args?.id);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'id must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const supportsEventDisplayName = await hasEventsDisplayNameColumn();

      const eventResult = await query<any[]>(`
        SELECT
          e.id,
          e.id AS eventId,
          e.committee_id AS committeeId,
          c.address AS committeeAddress,
          e.name AS eventName,
          ${supportsEventDisplayName ? "COALESCE(NULLIF(TRIM(e.display_name), ''), LEFT(e.name, 20))" : 'LEFT(e.name, 20)'} AS eventDisplayName,
          e.category,
          e.event_year AS eventYear,
          e.type,
          DATE_FORMAT(e.start_date, '%Y-%m-%d') AS startDate,
          DATE_FORMAT(e.end_date, '%Y-%m-%d') AS endDate,
          e.latitude,
          e.longitude,
          e.event_logo AS eventLogo
        FROM events e
        LEFT JOIN committees c ON c.id = e.committee_id
        WHERE e.id = ?
        LIMIT 1
      `, [eventId]);

      if (!eventResult || eventResult.length === 0) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventResult[0];
      const eventType = String(event.type || '').toUpperCase();

      const committeeMembership = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const membership = committeeMembership[0];

      const myDesignationRows = await query<any[]>(
        `SELECT ue.role_id AS roleId,
               UPPER(COALESCE(NULLIF(TRIM(ue.designation), ''), 'MEMBER')) AS name,
               erm.color,
               CASE
                 WHEN erm.icon IS NOT NULL AND CHAR_LENGTH(erm.icon) > 0
                 THEN CASE
                        WHEN CHAR_LENGTH(erm.icon) = 1 THEN erm.icon
                        ELSE CONVERT(CAST(erm.icon AS BINARY) USING utf8mb4)
                      END
                 ELSE NULL
               END AS icon
        FROM users_events ue
        LEFT JOIN events_roles_master erm ON erm.role_id = ue.role_id
        WHERE ue.event_id = ? AND ue.user_id = ?
        LIMIT 1`,
        [eventId, loggedInUserId]
      ).catch(() => []);
      const myDesignation = myDesignationRows[0] || null;
      if (myDesignation && Buffer.isBuffer(myDesignation.icon)) {
        myDesignation.icon = myDesignation.icon.toString('utf8');
      }

      const hasCommitteeAccess = Boolean(
        membership &&
        (
          String(membership.committee_role || '') === 'COMMITTEE_MEMBER' ||
          String(membership.committee_role || '') === 'COMMITTEE_ADMIN' ||
          String(membership.committee_role || '') === 'COMMITTEE_MASTER_ADMIN'
        )
      );

      const isCurrentUserMasterAdmin = Boolean(membership && String(membership.committee_role || '') === 'COMMITTEE_MASTER_ADMIN');
      const canManageVotingRoles = Boolean(
        membership && (
          String(membership.committee_role || '') === 'COMMITTEE_ADMIN' ||
          String(membership.committee_role || '') === 'COMMITTEE_MASTER_ADMIN'
        )
      );
      const canSelfNominate = Boolean(membership && String(membership.committee_role || '') === 'COMMITTEE_MEMBER');
      const committeeRole = isCurrentUserMasterAdmin
        ? 'COMMITTEE_MASTER_ADMIN'
        : canManageVotingRoles
          ? 'COMMITTEE_ADMIN'
          : canSelfNominate
            ? 'COMMITTEE_MEMBER'
            : 'NONE';

      if (eventType !== 'PUBLIC' && !hasCommitteeAccess) {
        throwEventError('FORBIDDEN', 'You are not allowed to access this event');
      }

      return {
        id: Number(event.id),
        eventId: Number(event.eventId),
        committeeId: event.committeeId || null,
        committeeAddress: event.committeeAddress || null,
        eventName: String(event.eventName || ''),
        eventDisplayName: String(event.eventDisplayName || ''),
        eventLogo: event.eventLogo || null,
        category: event.category || null,
        eventYear: event.eventYear ? Number(event.eventYear) : null,
        type: event.type || null,
        startDate: event.startDate || null,
        endDate: event.endDate || null,
        latitude: event.latitude ? Number(event.latitude) : null,
        longitude: event.longitude ? Number(event.longitude) : null,
        myDesignation: myDesignation,
        committeeRole
      };
    }
  }
};
