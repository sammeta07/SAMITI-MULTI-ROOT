import { query } from '../../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsDisplayNameColumn } from '../event-display-name-support';
import { throwEventError, getLoggedInUserId } from '../voting/event-voting-core.graphql';

export const eventOverviewTypes = `
  type EventOverview {
    id: Int!
    eventId: Int!
    eventName: String!
    eventDisplayName: String!
    bannerImages: [String!]!
    myDesignation: MyDesignation
    committeeRole: String
    canAssignProgramOwner: Boolean!
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

      const eventResult = await query<any[]>(`
        SELECT
          e.id,
          e.id AS eventId,
          e.committee_id AS committeeId,
          e.name AS eventName,
          ${supportsEventDisplayName ? "COALESCE(NULLIF(TRIM(e.display_name), ''), LEFT(e.name, 20))" : 'LEFT(e.name, 20)'} AS eventDisplayName
        FROM events e
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
               CASE
                 WHEN LOWER(TRIM(COALESCE(ue.designation, ''))) IN ('adhyaksha', 'upadhyaksha')
                   OR LOWER(TRIM(COALESCE(erm.english_name, ''))) IN ('adhyaksha', 'upadhyaksha')
                   OR LOWER(TRIM(COALESCE(erm.role_name, ''))) IN ('adhyaksha', 'upadhyaksha')
                 THEN 1 ELSE 0
               END AS canAssignByDesignation,
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
      const canAssignProgramOwner =
        committeeRole === 'COMMITTEE_ADMIN' ||
        committeeRole === 'COMMITTEE_MASTER_ADMIN' ||
        Boolean(Number(myDesignation?.canAssignByDesignation));

      if (eventType !== 'PUBLIC' && !hasCommitteeAccess) {
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
        eventName: String(event.eventName || ''),
        eventDisplayName: String(event.eventDisplayName || ''),
        bannerImages: bannerImageRows.map((row) => row.mediaUrl),
        myDesignation: myDesignation,
        committeeRole,
        canAssignProgramOwner
      };
    }
  }
};
