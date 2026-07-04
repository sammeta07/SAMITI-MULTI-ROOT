import { query, execute } from '../../config/db';

export const createEventTypes = `
  type CreatedEvent {
    id: Int!
    eventId: Int!
    eventName: String!
    committeeId: Int!
    description: String
    eventBanner: String
    bannerImages: [String!]!
    status: String!
    type: String
    visibility: String!
    startDate: String
    endDate: String
    createdBy: Int!
    updatedBy: Int
    createdAt: String!
  }

  input CreateEventInput {
    committeeId: Int!
    eventName: String!
    description: String
    eventBanner: String
    bannerImageUrls: [String!]
    status: String!
    type: String
    visibility: String!
    startDate: String
    endDate: String
  }
`;

export const createEventMutationFields = `
  createEvent(input: CreateEventInput!): CreatedEvent
`;

export const createEventResolvers = {
  Mutation: {
    async createEvent(_: any, args: any, context: any) {
      // 🔐 Authentication & Authorization
      const authHeader = context.headers?.authorization;
      const tokenFromCookie = context.cookies?.token;
      let accessToken: string | null = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.slice(7);
      } else if (tokenFromCookie) {
        accessToken = tokenFromCookie;
      }

      if (!accessToken) {
        throw new Error('Unauthorized: No token provided');
      }

      // 🔓 Decode token to get user ID
      let loggedInUserId: number = 0;
      try {
        const decoded: any = await context.jwt.verify(accessToken);
        loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);
        if (!loggedInUserId) {
          throw new Error('Invalid token: No user ID found');
        }
      } catch (error: any) {
        throw new Error(`Token verification failed: ${error.message}`);
      }

      const {
        committeeId,
        eventName,
        description,
        eventBanner,
        bannerImageUrls,
        status,
        type,
        visibility,
        startDate,
        endDate
      } = args.input;

      if (!committeeId || !eventName) {
        throw new Error('Committee ID and Event Name are required');
      }

      if (!status) {
        throw new Error('Event Status is required');
      }

      try {
        // 🔐 Check if user is committee admin
        const adminCheck = await query(
          `SELECT user_id FROM users_committees 
           WHERE committee_id = ? AND user_id = ? AND is_committee_admin = 1 LIMIT 1`,
          [committeeId, loggedInUserId]
        );

        if (adminCheck.length === 0) {
          throw new Error('Only committee admins can create events');
        }

        // ✅ Insert new event with all fields including created_by, updated_by, created_at
        const result = await execute(
          `INSERT INTO events (committee_id, name, description, event_banner, status, type, visibility, start_date, end_date, created_by, updated_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [committeeId, eventName, description || null, eventBanner || null, status, type || null, visibility || 'VISIBLE', startDate || null, endDate || null, loggedInUserId, loggedInUserId]
        );

        const eventId = result.insertId;

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

        // Fetch and return the created event
        const createdEvent = await query(
          `SELECT id, id as eventId, name as eventName, committee_id as committeeId,
                  description, event_banner as eventBanner, status, type, visibility,
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
          return null;
        }

        return {
          ...createdEventRecord,
          bannerImages: eventBannerImages.map((imageRow) => String(imageRow.mediaUrl))
        };
      } catch (error: any) {
        throw new Error(`Failed to create event: ${error.message}`);
      }
    }
  }
};
