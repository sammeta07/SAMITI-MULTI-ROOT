import { query } from '../../config/db';
import { hasEventsDisplayNameColumn } from './event-display-name-support';

const ALLOWED_EVENT_STATUSES = new Set(['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED']);
const ALLOWED_EVENT_VISIBILITIES = new Set(['VISIBLE', 'HIDDEN']);

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

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEnumInput(value: unknown, allowedValues: Set<string>, fieldName: string): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  const normalizedUpper = normalized.toUpperCase();
  if (!allowedValues.has(normalizedUpper)) {
    throwEventError('BAD_REQUEST', `Invalid ${fieldName}`);
  }

  return normalizedUpper;
}

export const eventsListTypes = `
  type EventListItem {
    id: Int!
    eventId: Int!
    committeeId: Int
    eventName: String!
    eventDisplayName: String!
    eventBanner: String
    status: String!
    category: String
    type: String!
    visibility: String!
    startDate: String
    endDate: String
    address: String
    createdBy: Int!
    updatedBy: Int
    createdAt: String
  }
`;

export const eventsListQueryFields = `
  eventsByCommittee(committeeId: Int!, status: String, visibility: String): [EventListItem!]!
`;

export const eventsListResolvers = {
  Query: {
    async eventsByCommittee(
      _: any,
      args: { committeeId: number; status?: string | null; visibility?: string | null },
      context: any
    ) {
      const committeeId = Number(args?.committeeId);
      if (!Number.isInteger(committeeId) || committeeId <= 0) {
        throwEventError('BAD_REQUEST', 'committeeId must be a positive integer');
      }

      const statusFilter = normalizeEnumInput(args?.status, ALLOWED_EVENT_STATUSES, 'status');
      const visibilityFilter = normalizeEnumInput(args?.visibility, ALLOWED_EVENT_VISIBILITIES, 'visibility');
      const loggedInUserId = await getLoggedInUserId(context);
      const supportsEventDisplayName = await hasEventsDisplayNameColumn();

      const committeeMembership = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [committeeId, loggedInUserId]
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

      const whereClauses: string[] = ['e.committee_id = ?'];
      const params: Array<number | string> = [committeeId];

      if (statusFilter) {
        whereClauses.push('UPPER(e.status) = ?');
        params.push(statusFilter);
      }

      if (visibilityFilter) {
        whereClauses.push('UPPER(e.visibility) = ?');
        params.push(visibilityFilter);
      }

      if (!hasCommitteeAccess && !visibilityFilter) {
        whereClauses.push(`UPPER(e.visibility) = 'VISIBLE'`);
      }

      const events = await query<any[]>(
        `SELECT
           e.id,
           e.id AS eventId,
           e.committee_id AS committeeId,
           e.name AS eventName,
           ${supportsEventDisplayName ? "COALESCE(NULLIF(TRIM(e.display_name), ''), LEFT(e.name, 20))" : 'LEFT(e.name, 20)'} AS eventDisplayName,
           e.address,
           e.status,
           e.category,
           e.\`type\` AS type,
           e.visibility,
           DATE_FORMAT(e.start_date, '%Y-%m-%d') AS startDate,
           DATE_FORMAT(e.end_date, '%Y-%m-%d') AS endDate,
           e.created_by AS createdBy,
           e.updated_by AS updatedBy,
           e.created_at AS createdAt,
           (
             SELECT media_url
             FROM event_media_assets ema
             WHERE ema.event_id = e.id
             ORDER BY ema.sort_order ASC, ema.id ASC
             LIMIT 1
           ) AS eventBanner
         FROM events e
         WHERE ${whereClauses.join(' AND ')}
         ORDER BY e.start_date ASC, e.name ASC`,
        params
      );

      return events;
    }
  }
};
