import { execute, query } from '../../../config/db';
import { hasEventsDisplayNameColumn } from '../details/event-display-name-support';

const ALLOWED_EVENT_STATUSES = new Set(['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED']);
const ALLOWED_EVENT_VISIBILITIES = new Set(['VISIBLE', 'HIDDEN']);
const ALLOWED_EVENT_TYPES = new Set(['PUBLIC', 'PRIVATE']);

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

function normalizeDateInput(value: unknown, fieldName: string): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throwEventError('BAD_REQUEST', `${fieldName} must be in YYYY-MM-DD format`);
  }

  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throwEventError('BAD_REQUEST', `${fieldName} is not a valid date`);
  }

  return normalized;
}

function normalizeEnumInput(value: unknown, fallbackValue: string, allowed: Set<string>, fieldName: string): string {
  const normalized = (normalizeOptionalText(value) || fallbackValue).toUpperCase();
  if (!allowed.has(normalized)) {
    throwEventError('BAD_REQUEST', `Invalid ${fieldName}`);
  }

  return normalized;
}

function buildEventDisplayName(eventName: string, rawDisplayName: unknown): string {
  const normalizedDisplayName = normalizeOptionalText(rawDisplayName);

  if (!normalizedDisplayName) {
    throwEventError('BAD_REQUEST', 'eventDisplayName is required');
  }

  if (normalizedDisplayName.length > 20) {
    throwEventError('BAD_REQUEST', 'eventDisplayName cannot exceed 20 characters');
  }

  return normalizedDisplayName;
}

export const updateEventTypes = `
  type UpdatedEvent {
    id: Int!
    eventId: Int!
    eventName: String!
    eventDisplayName: String!
    committeeId: Int!
    address: String
    eventBanner: String
    bannerImages: [String!]!
    status: String!
    category: String
    visibility: String!
    type: String
    startDate: String
    endDate: String
    latitude: Float!
    longitude: Float!
    createdBy: Int!
    updatedBy: Int
    createdAt: String!
  }

  type UpdatedEventLogo {
    eventId: Int!
    eventLogo: String
  }

  input UpdateEventLogoInput {
    eventId: Int!
    committeeId: Int!
    eventLogo: String
  }

  input UpdateEventInput {
    eventId: Int!
    committeeId: Int!
    eventName: String!
    eventDisplayName: String!
    address: String
    status: String!
    category: String
    visibility: String!
    type: String
    startDate: String
    endDate: String
    latitude: Float!
    longitude: Float!
    eventLogo: String
  }
`;

export const updateEventMutationFields = `
  updateEvent(input: UpdateEventInput!): UpdatedEvent
  updateEventLogo(input: UpdateEventLogoInput!): UpdatedEventLogo
`;

export const updateEventResolvers = {
  Mutation: {
    async updateEvent(_: any, args: any, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);

      const input = args?.input || {};
      const eventId = Number(input.eventId);
      const committeeId = Number(input.committeeId);
      const eventName = normalizeOptionalText(input.eventName);
      const eventDisplayName = eventName ? buildEventDisplayName(eventName, input.eventDisplayName) : null;
      const address = normalizeOptionalText(input.address);
      const category = normalizeOptionalText(input.category);
      const normalizedStatus = normalizeEnumInput(input.status, 'UPCOMING', ALLOWED_EVENT_STATUSES, 'status');
      const normalizedVisibility = normalizeEnumInput(input.visibility, 'VISIBLE', ALLOWED_EVENT_VISIBILITIES, 'visibility');
      const normalizedType = normalizeEnumInput(input.type, 'PUBLIC', ALLOWED_EVENT_TYPES, 'type');
      const normalizedStartDate = normalizeDateInput(input.startDate, 'startDate');
      const normalizedEndDate = normalizeDateInput(input.endDate, 'endDate');
      const latitude = Number(input.latitude);
      const longitude = Number(input.longitude);
      const eventLogo = normalizeOptionalText(input.eventLogo);

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      if (!Number.isInteger(committeeId) || committeeId <= 0) {
        throwEventError('BAD_REQUEST', 'committeeId must be a positive integer');
      }

      if (!eventName) {
        throwEventError('BAD_REQUEST', 'eventName is required');
      }

      if (eventName.length > 255) {
        throwEventError('BAD_REQUEST', 'eventName cannot exceed 255 characters');
      }

      if (!normalizedStartDate) {
        throwEventError('BAD_REQUEST', 'startDate is required');
      }

      if (normalizedStartDate && normalizedEndDate && normalizedStartDate > normalizedEndDate) {
        throwEventError('BAD_REQUEST', 'startDate cannot be after endDate');
      }

      if (Number.isNaN(latitude)) {
        throwEventError('BAD_REQUEST', 'latitude must be a valid number');
      }

      if (Number.isNaN(longitude)) {
        throwEventError('BAD_REQUEST', 'longitude must be a valid number');
      }

      const supportsEventDisplayName = await hasEventsDisplayNameColumn();

      const existingEventRows = await query<any[]>(
        `SELECT id, committee_id AS committeeId
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      const existingEvent = existingEventRows[0];
      if (!existingEvent) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      if (Number(existingEvent.committeeId) !== committeeId) {
        throwEventError('BAD_REQUEST', 'committeeId does not match the selected event');
      }

      const adminCheck = await query<any[]>(
        `SELECT user_id
         FROM users_committees
         WHERE committee_id = ? AND user_id = ? AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         LIMIT 1`,
        [committeeId, loggedInUserId]
      );

      if (adminCheck.length === 0) {
        throwEventError('FORBIDDEN', 'Only committee admins can update events');
      }

      const targetEventYear = Number(normalizedStartDate.slice(0, 4));
      const duplicateEventRows = await query<any[]>(
        `SELECT e.id, e.name AS existingEventName, u.name AS creatorName
         FROM events e
         LEFT JOIN users u ON u.id = e.created_by
         WHERE e.committee_id = ?
           AND e.id <> ?
           AND LOWER(TRIM(e.name)) = LOWER(TRIM(?))
           AND YEAR(e.start_date) = ?
         LIMIT 1`,
        [committeeId, eventId, eventName, targetEventYear]
      );

      if (duplicateEventRows.length > 0) {
        const duplicateEvent = duplicateEventRows[0];
        throwEventError(
          'CONFLICT',
          `${String(duplicateEvent.existingEventName)} is already created by ${String(duplicateEvent.creatorName)}`
        );
      }

      if (supportsEventDisplayName) {
        await execute(
          `UPDATE events
           SET name = ?,
               display_name = ?,
               address = ?,
               status = ?,
               category = ?,
               visibility = ?,
               type = ?,
                start_date = ?,
                end_date = ?,
                latitude = ?,
                longitude = ?,
                event_logo = ?,
                updated_by = ?
            WHERE id = ?`,
           [
            eventName,
            eventDisplayName,
            address,
            normalizedStatus,
            category,
            normalizedVisibility,
            normalizedType,
            normalizedStartDate,
            normalizedEndDate,
            latitude,
            longitude,
            eventLogo,
            loggedInUserId,
            eventId
          ]
        );
      } else {
        await execute(
          `UPDATE events
           SET name = ?,
               address = ?,
               status = ?,
               category = ?,
               visibility = ?,
               type = ?,
                start_date = ?,
                end_date = ?,
                latitude = ?,
                longitude = ?,
                event_logo = ?,
                updated_by = ?
            WHERE id = ?`,
           [
            eventName,
            address,
            normalizedStatus,
            category,
            normalizedVisibility,
            normalizedType,
            normalizedStartDate,
            normalizedEndDate,
            latitude,
            longitude,
            eventLogo,
            loggedInUserId,
            eventId
          ]
        );
      }

      const updatedEventRows = await query<any[]>(
        supportsEventDisplayName
          ? `SELECT id, id as eventId, name as eventName,
                    COALESCE(NULLIF(TRIM(display_name), ''), LEFT(name, 20)) as eventDisplayName,
                    committee_id as committeeId,
                    address, status, category, visibility, \`type\`, latitude, longitude,
                    event_logo as eventLogo,
                    start_date as startDate, end_date as endDate, created_by as createdBy, updated_by as updatedBy, created_at as createdAt
              FROM events WHERE id = ?`
          : `SELECT id, id as eventId, name as eventName,
                    LEFT(name, 20) as eventDisplayName,
                    committee_id as committeeId,
                    address, status, category, visibility, \`type\`, latitude, longitude,
                    event_logo as eventLogo,
                    start_date as startDate, end_date as endDate, created_by as createdBy, updated_by as updatedBy, created_at as createdAt
              FROM events WHERE id = ?`,
        [eventId]
      );

      const eventBannerImages = await query<any[]>(
        `SELECT media_url AS mediaUrl
         FROM event_media_assets
         WHERE event_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [eventId]
      );

      const updatedEventRecord = updatedEventRows[0] || null;
      if (!updatedEventRecord) {
        throwEventError('INTERNAL_ERROR', 'Event updated but could not be fetched');
      }

      return {
        ...updatedEventRecord,
        eventLogo: updatedEventRecord?.eventLogo || null,
        eventBanner: eventBannerImages[0] ? String(eventBannerImages[0].mediaUrl) : null,
        bannerImages: eventBannerImages.map((imageRow) => String(imageRow.mediaUrl))
      };
    },

    async updateEventLogo(_: any, args: any, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);

      const input = args?.input || {};
      const eventId = Number(input.eventId);
      const committeeId = Number(input.committeeId);
      const eventLogo = normalizeOptionalText(input.eventLogo);

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      if (!Number.isInteger(committeeId) || committeeId <= 0) {
        throwEventError('BAD_REQUEST', 'committeeId must be a positive integer');
      }

      const existingEventRows = await query<any[]>(
        `SELECT id, committee_id AS committeeId
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      const existingEvent = existingEventRows[0];
      if (!existingEvent) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      if (Number(existingEvent.committeeId) !== committeeId) {
        throwEventError('BAD_REQUEST', 'committeeId does not match the selected event');
      }

      const adminCheck = await query<any[]>(
        `SELECT user_id
         FROM users_committees
         WHERE committee_id = ? AND user_id = ? AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         LIMIT 1`,
        [committeeId, loggedInUserId]
      );

      if (adminCheck.length === 0) {
        throwEventError('FORBIDDEN', 'Only committee admins can update event logo');
      }

      await execute(
        `UPDATE events
         SET event_logo = ?, updated_by = ?
         WHERE id = ?`,
        [eventLogo, loggedInUserId, eventId]
      );

      return {
        eventId,
        eventLogo: eventLogo || null
      };
    }
  }
};


