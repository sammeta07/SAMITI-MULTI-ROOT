import { query } from '../../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsDisplayNameColumn } from '../event-display-name-support';
import { hasEventsVotingPhaseStateColumn } from '../voting/event-voting-phase-support';
import { hasEventsVotingModeColumn } from '../voting/event-voting-mode-support';
import { throwEventError, getLoggedInUserId, getEventVotingPhaseState } from '../voting/event-voting-core.graphql';

export const eventOverviewTypes = `
  type EventOverview {
    id: Int!
    eventId: Int!
    committeeId: Int
    committeeAddress: String
    eventName: String!
    eventDisplayName: String!
    eventBanner: String
    eventLogo: String
    bannerImages: [String!]!
    status: String!
    category: String
    visibility: String!
    type: String
    startDate: String
    endDate: String
    latitude: Float
    longitude: Float
    createdBy: Int!
    updatedBy: Int
    createdAt: String
    myDesignation: MyDesignation
    committeeRole: String
  }

  type MyDesignation {
    roleId: Int
    name: String
    color: String
    icon: String
  }
`;

export const eventOverviewQueryFields = `
  eventOverview(id: Int!): EventOverview!
`;

export const eventOverviewResolvers = {
  Query: {
    async eventOverview(_: any, args: { id: number }, context: any) {
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
          e.created_at AS createdAt,
          e.event_logo AS eventLogo
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

      if (visibility === 'HIDDEN' && !hasCommitteeAccess) {
        throwEventError('FORBIDDEN', 'You are not allowed to access this event');
      }

      const bannerImageRows = await query<Array<RowDataPacket & { mediaUrl: string }>>(
        `SELECT media_url AS mediaUrl
         FROM event_media_assets
         WHERE event_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [eventId]
      );

      return {
        id: Number(event.id),
        eventId: Number(event.eventId),
        committeeId: event.committeeId || null,
        committeeAddress: event.committeeAddress || null,
        eventName: String(event.eventName || ''),
        eventDisplayName: String(event.eventDisplayName || ''),
        eventBanner: bannerImageRows[0]?.mediaUrl || null,
        eventLogo: event.eventLogo || null,
        bannerImages: bannerImageRows.map((row) => row.mediaUrl),
        status: String(event.status || ''),
        category: event.category || null,
        visibility: String(event.visibility || ''),
        type: event.type || null,
        startDate: event.startDate || null,
        endDate: event.endDate || null,
        latitude: event.latitude ? Number(event.latitude) : null,
        longitude: event.longitude ? Number(event.longitude) : null,
        createdBy: Number(event.createdBy),
        updatedBy: event.updatedBy ? Number(event.updatedBy) : null,
        createdAt: event.createdAt || null,
        myDesignation: myDesignation,
        committeeRole
      };
    }
  }
};
