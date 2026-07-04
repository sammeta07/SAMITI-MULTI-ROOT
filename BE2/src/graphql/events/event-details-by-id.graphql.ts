import { query } from '../../config/db';
import { RowDataPacket } from 'mysql2/promise';

export const eventDetailsTypes = `
  type EventDetails {
    id: Int!
    eventId: Int!
    committeeId: Int
    eventName: String!
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
    createdAt: String
  }
`;

export const eventDetailsQueryFields = `
    eventDetails(id: Int!): EventDetails!
`;

export const eventDetailsResolvers = {
  Query: {
    async eventDetails(_: any, args: { id: number }, context: any) {
      const { id: eventId } = args;

      const authHeader = context.headers?.authorization;
      const tokenFromCookie = context.cookies?.token;
      let accessToken: string | null = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      } else if (tokenFromCookie) {
        accessToken = tokenFromCookie;
      }

      if (!accessToken) {
        throw new Error('Unauthorized: Missing access token');
      }

      const decoded: any = await context.jwt.verify(accessToken);
      const loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);
      if (!loggedInUserId) {
        throw new Error('Unauthorized: Invalid token');
      }

      const eventResult = await query<any[]>(`
        SELECT
          id,
          id AS eventId,
          committee_id AS committeeId,
          name,
          description,
          status,
          type,
          visibility,
          DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
          DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate,
          created_by AS createdBy,
          updated_by AS updatedBy,
          created_at AS createdAt
        FROM events
        WHERE id = ?
        LIMIT 1
      `, [eventId]);

      if (!eventResult || eventResult.length === 0) {
        throw new Error(`Event with ID ${eventId} not found`);
      }

      const bannerImageRows = await query<Array<RowDataPacket & { mediaUrl: string }>>(
        `SELECT media_url AS mediaUrl
         FROM event_media_assets
         WHERE event_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [eventId]
      );

      return {
        ...eventResult[0],
        eventBanner: bannerImageRows[0]?.mediaUrl || null,
        bannerImages: bannerImageRows.map((row) => row.mediaUrl)
      };
    }
  }
};