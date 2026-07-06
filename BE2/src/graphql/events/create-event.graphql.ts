import { query, execute } from '../../config/db';
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

export const createEventTypes = `
  type CreatedEvent {
    id: Int!
    eventId: Int!
    eventName: String!
    eventDisplayName: String!
    committeeId: Int!
    description: String
    address: String
    eventBanner: String
    bannerImages: [String!]!
    status: String!
    category: String
    visibility: String!
    startDate: String
    endDate: String
    latitude: Float!
    longitude: Float!
    createdBy: Int!
    updatedBy: Int
    createdAt: String!
  }

  input CreateEventInput {
    committeeId: Int!
    eventName: String!
    eventDisplayName: String!
    description: String
    address: String
    eventBanner: String
    bannerImageUrls: [String!]
    status: String!
    category: String
    visibility: String!
    startDate: String
    endDate: String
    latitude: Float!
    longitude: Float!
  }
`;

export const createEventMutationFields = `
  createEvent(input: CreateEventInput!): CreatedEvent
`;

export const createEventResolvers = {
  Mutation: {
    async createEvent(_: any, args: any, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);

      const input = args?.input || {};
      const committeeId = Number(input.committeeId);
      const eventName = normalizeOptionalText(input.eventName);
      const eventDisplayName = eventName ? buildEventDisplayName(eventName, input.eventDisplayName) : null;
      const description = normalizeOptionalText(input.description);
      const address = normalizeOptionalText(input.address);
      const category = normalizeOptionalText(input.category);
      const normalizedStatus = normalizeEnumInput(input.status, 'UPCOMING', ALLOWED_EVENT_STATUSES, 'status');
      const normalizedVisibility = normalizeEnumInput(input.visibility, 'VISIBLE', ALLOWED_EVENT_VISIBILITIES, 'visibility');
      const normalizedStartDate = normalizeDateInput(input.startDate, 'startDate');
      const normalizedEndDate = normalizeDateInput(input.endDate, 'endDate');
      const latitude = Number(input.latitude);
      const longitude = Number(input.longitude);

      if (isNaN(latitude)) throwEventError('BAD_REQUEST', 'latitude must be a valid number');
      if (isNaN(longitude)) throwEventError('BAD_REQUEST', 'longitude must be a valid number');

      if (!Number.isInteger(committeeId) || committeeId <= 0) {
        throwEventError('BAD_REQUEST', 'committeeId must be a positive integer');
      }

      if (!eventName) {
        throwEventError('BAD_REQUEST', 'eventName is required');
      }

      if (eventName.length > 255) {
        throwEventError('BAD_REQUEST', 'eventName cannot exceed 255 characters');
      }

      if (normalizedStartDate && normalizedEndDate && normalizedStartDate > normalizedEndDate) {
        throwEventError('BAD_REQUEST', 'startDate cannot be after endDate');
      }

      try {
        const supportsEventDisplayName = await hasEventsDisplayNameColumn();

        const adminCheck = await query<any[]>(
          `SELECT user_id FROM users_committees 
           WHERE committee_id = ? AND user_id = ? AND is_committee_admin = 1 LIMIT 1`,
          [committeeId, loggedInUserId]
        );

        if (adminCheck.length === 0) {
          throwEventError('FORBIDDEN', 'Only committee admins can create events');
        }

        if (!normalizedStartDate) {
          throwEventError('BAD_REQUEST', 'startDate is required for duplicate event validation by year');
        }

        const targetEventYear = Number(normalizedStartDate.slice(0, 4));

        const duplicateEventRows = await query<any[]>(
          `SELECT e.id, e.name AS existingEventName, u.name AS creatorName
           FROM events e
           LEFT JOIN users u ON u.id = e.created_by
           WHERE committee_id = ?
             AND LOWER(TRIM(e.name)) = LOWER(TRIM(?))
             AND YEAR(e.start_date) = ?
           LIMIT 1`,
          [committeeId, eventName, targetEventYear]
        );

        if (duplicateEventRows.length > 0) {
          const duplicateEvent = duplicateEventRows[0];
          throwEventError(
            'CONFLICT',
            `${String(duplicateEvent.existingEventName)} is already created by ${String(duplicateEvent.creatorName)}`
          );
        }

        const result = supportsEventDisplayName
          ? await execute(
              `INSERT INTO events (committee_id, name, display_name, description, address, status, category, visibility, start_date, end_date, latitude, longitude, created_by, updated_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
              [
                committeeId,
                eventName,
                eventDisplayName,
                description,
                address,
                normalizedStatus,
                category,
                normalizedVisibility,
                normalizedStartDate,
                normalizedEndDate,
                latitude,
                longitude,
                loggedInUserId,
                loggedInUserId
              ]
            )
          : await execute(
              `INSERT INTO events (committee_id, name, description, address, status, category, visibility, start_date, end_date, latitude, longitude, created_by, updated_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
              [
                committeeId,
                eventName,
                description,
                address,
                normalizedStatus,
                category,
                normalizedVisibility,
                normalizedStartDate,
                normalizedEndDate,
                latitude,
                longitude,
                loggedInUserId,
                loggedInUserId
              ]
            );

        const eventId = result.insertId;

        const eventBanner = normalizeOptionalText(input.eventBanner);
        const bannerImageUrls = Array.isArray(input.bannerImageUrls) ? input.bannerImageUrls : [];
        const normalizedBannerImageUrls: string[] = Array.isArray(bannerImageUrls)
          ? bannerImageUrls.filter((url: unknown) => typeof url === 'string' && url.trim().length > 0).map((url: string) => url.trim())
          : [];

        const allBannerImagesToPersist = normalizedBannerImageUrls.length > 0
          ? normalizedBannerImageUrls
          : (eventBanner ? [eventBanner] : []);

        for (let imageIndex = 0; imageIndex < allBannerImagesToPersist.length; imageIndex += 1) {
          await execute(
            `INSERT INTO event_media_assets (event_id, media_url, media_type, sort_order, created_by, created_at)
             VALUES (?, ?, 'BANNER', ?, ?, NOW())`,
            [eventId, allBannerImagesToPersist[imageIndex], imageIndex + 1, loggedInUserId]
          );
        }

        const createdEvent = await query<any[]>(
          supportsEventDisplayName
            ? `SELECT id, id as eventId, name as eventName,
                      COALESCE(NULLIF(TRIM(display_name), ''), LEFT(name, 20)) as eventDisplayName,
                      committee_id as committeeId,
                      description, address, status, category, visibility, latitude, longitude,
                      start_date as startDate, end_date as endDate, created_by as createdBy, updated_by as updatedBy, created_at as createdAt
               FROM events WHERE id = ?`
            : `SELECT id, id as eventId, name as eventName,
                      LEFT(name, 20) as eventDisplayName,
                      committee_id as committeeId,
                      description, address, status, category, visibility, latitude, longitude,
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

        const createdEventRecord = createdEvent[0] || null;
        if (!createdEventRecord) {
          throwEventError('INTERNAL_ERROR', 'Event created but could not be fetched');
        }

        return {
          ...createdEventRecord,
          eventBanner: eventBannerImages[0] ? String(eventBannerImages[0].mediaUrl) : null,
          bannerImages: eventBannerImages.map((imageRow) => String(imageRow.mediaUrl))
        };
      } catch (error: unknown) {
        if (error instanceof Error && /^[A-Z_]+: /.test(error.message)) {
          throw error;
        }

        throwEventError('INTERNAL_ERROR', 'Failed to create event');
      }
    }
  }
};
