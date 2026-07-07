import { query } from '../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsDisplayNameColumn } from './event-display-name-support';

function throwEventError(code: string, message: string): never {
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

async function getLoggedInUserId(context: any): Promise<number> {
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

export const eventDetailsTypes = `
  type EventDetails {
    id: Int!
    eventId: Int!
    committeeId: Int
    committeeAddress: String
    eventName: String!
    eventDisplayName: String!
    eventBanner: String
    bannerImages: [String!]!
    status: String!
    category: String
    visibility: String!
    startDate: String
    endDate: String
    address: String
    createdBy: Int!
    updatedBy: Int
    createdAt: String
  }
`;

export const eventDetailsQueryFields = `
    eventDetails(id: Int!): EventDetails!
`;

export const eventDetailsResolvers = {
  Query: {
    async eventDetails(_: any, args: { id: number }, context: any) {
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
          e.address,
          e.status,
          e.category,
          e.visibility,
          DATE_FORMAT(e.start_date, '%Y-%m-%d') AS startDate,
          DATE_FORMAT(e.end_date, '%Y-%m-%d') AS endDate,
          e.created_by AS createdBy,
          e.updated_by AS updatedBy,
          e.created_at AS createdAt
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

      if (visibility === 'HIDDEN') {
        const committeeMembership = await query<any[]>(
          `SELECT is_committee_member, is_committee_admin
           FROM users_committees
           WHERE committee_id = ? AND user_id = ?
           LIMIT 1`,
          [Number(event.committeeId), loggedInUserId]
        );

        const membership = committeeMembership[0];
        const hasCommitteeAccess = Boolean(
          membership &&
          (Number(membership.is_committee_member) === 1 || Number(membership.is_committee_admin) === 1)
        );

        if (!hasCommitteeAccess) {
          throwEventError('FORBIDDEN', 'You are not allowed to access this event');
        }
      }

      const bannerImageRows = await query<Array<RowDataPacket & { mediaUrl: string }>>(
        `SELECT media_url AS mediaUrl
         FROM event_media_assets
         WHERE event_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [eventId]
      );

      return {
        ...event,
        eventBanner: bannerImageRows[0]?.mediaUrl || null,
        bannerImages: bannerImageRows.map((row) => row.mediaUrl)
      };
    }
  }
};