import { query, execute } from '../../config/db';

const MAX_BANNER_IMAGES = 5;

function throwError(code: string, message: string): never {
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
  if (!accessToken) throwError('UNAUTHORIZED', 'Missing access token');
  try {
    const decoded: any = await context.jwt.verify(accessToken);
    const userId = Number(decoded?.id || decoded?.user_id || decoded?.uid);
    if (!Number.isInteger(userId) || userId <= 0) throwError('UNAUTHORIZED', 'Invalid token payload');
    return userId;
  } catch {
    throwError('UNAUTHORIZED', 'Invalid or expired token');
  }
}

export const uploadEventBannerImagesTypes = `
  type UploadEventBannerImagesPayload {
    eventId: Int!
    bannerImages: [String!]!
  }
`;

export const uploadEventBannerImagesMutationFields = `
  uploadEventBannerImages(eventId: Int!, bannerImageUrls: [String!]!): UploadEventBannerImagesPayload!
  deleteEventBannerImage(eventId: Int!, mediaUrl: String!): UploadEventBannerImagesPayload!
`;

export const uploadEventBannerImagesResolvers = {
  Mutation: {
    async uploadEventBannerImages(_: any, args: { eventId: number; bannerImageUrls: string[] }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const incomingUrls: string[] = Array.isArray(args?.bannerImageUrls)
        ? args.bannerImageUrls.filter((u) => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
        : [];

      if (incomingUrls.length === 0) {
        throwError('BAD_REQUEST', 'At least one banner image URL is required');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      // Resolve committee via event -> verify admin
      const eventRows = await query<any[]>(
        `SELECT id, committee_id FROM events WHERE id = ? LIMIT 1`,
        [eventId]
      );
      if (eventRows.length === 0) throwError('NOT_FOUND', 'Event not found');

      const committeeId = Number(eventRows[0].committee_id);
      const adminRows = await query<any[]>(
        `SELECT user_id FROM users_committees
         WHERE committee_id = ? AND user_id = ? AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') LIMIT 1`,
        [committeeId, loggedInUserId]
      );
      if (adminRows.length === 0) throwError('FORBIDDEN', 'Only committee admins can upload event banners');

      // Count existing banners
      const existingRows = await query<any[]>(
        `SELECT id FROM event_media_assets WHERE event_id = ? ORDER BY sort_order ASC, id ASC`,
        [eventId]
      );
      const existingCount = existingRows.length;

      if (existingCount >= MAX_BANNER_IMAGES) {
        throwError('BAD_REQUEST', `Maximum ${MAX_BANNER_IMAGES} banner images allowed. Delete existing banners to upload new ones.`);
      }

      const slotsAvailable = MAX_BANNER_IMAGES - existingCount;
      const urlsToInsert = incomingUrls.slice(0, slotsAvailable);

      for (let i = 0; i < urlsToInsert.length; i++) {
        await execute(
          `INSERT INTO event_media_assets (event_id, media_url, media_type, sort_order, created_by, created_at)
           VALUES (?, ?, 'BANNER', ?, ?, NOW())`,
          [eventId, urlsToInsert[i], existingCount + i + 1, loggedInUserId]
        );
      }

      const updatedBannerRows = await query<any[]>(
        `SELECT media_url AS mediaUrl FROM event_media_assets
         WHERE event_id = ? ORDER BY sort_order ASC, id ASC`,
        [eventId]
      );

      return {
        eventId,
        bannerImages: updatedBannerRows.map((r) => r.mediaUrl)
      };
    },

    async deleteEventBannerImage(_: any, args: { eventId: number; mediaUrl: string }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const mediaUrl = typeof args?.mediaUrl === 'string' ? args.mediaUrl.trim() : '';
      if (!mediaUrl) {
        throwError('BAD_REQUEST', 'mediaUrl is required');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<any[]>(
        `SELECT id, committee_id FROM events WHERE id = ? LIMIT 1`,
        [eventId]
      );
      if (eventRows.length === 0) throwError('NOT_FOUND', 'Event not found');

      const committeeId = Number(eventRows[0].committee_id);
      const adminRows = await query<any[]>(
        `SELECT user_id FROM users_committees
         WHERE committee_id = ? AND user_id = ? AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN') LIMIT 1`,
        [committeeId, loggedInUserId]
      );
      if (adminRows.length === 0) throwError('FORBIDDEN', 'Only committee admins can delete event banners');

      await execute(
        `DELETE FROM event_media_assets WHERE event_id = ? AND media_url = ?`,
        [eventId, mediaUrl]
      );

      const updatedBannerRows = await query<any[]>(
        `SELECT media_url AS mediaUrl FROM event_media_assets
         WHERE event_id = ? ORDER BY sort_order ASC, id ASC`,
        [eventId]
      );

      return {
        eventId,
        bannerImages: updatedBannerRows.map((r) => r.mediaUrl)
      };
    }
  }
};
