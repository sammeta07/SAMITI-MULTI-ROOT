import { query } from '../../../config/db';

export const guestCommitteeTypes = `
  type EventSummary {
    eventId: Int!
    eventName: String!
    status: String!
    type: String
    visibility: String!
    startDate: String
    endDate: String
    eventBanner: String
    bannerImages: [String!]!
  }

  type Committee {
    id: Int!
    address: String!
    committeeName: String!
    contactNumbers: [String!]!
    description: String!
    distanceMeters: Float!
    committeeLogo: String
    establishYear: Int!
    events: [EventSummary!]!
  }
`;

export const guestCommitteeQueryFields = `
    committeesListGuestUser(latitude: Float!, longitude: Float!, distanceKm: Float!): [Committee!]!
`;
import { normalizeEventSummaryRow, parseContactNumbers } from './committee-list.helpers';

export const guestCommitteesResolvers = {
  Query: {
    async committeesListGuestUser(_: any, args: { latitude: number; longitude: number; distanceKm: number }) {
      const { latitude, longitude, distanceKm } = args;

      const rawList = await query<any[]>(`
        SELECT 
          id,
          committee_name,
          establish_year,
          address,
          logo,
          contact_numbers,
          description,
          (6371 * acos(
            cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(latitude))
          )) AS distanceKm
        FROM committees
        HAVING distanceKm <= ?
        ORDER BY distanceKm ASC
      `, [latitude, longitude, latitude, distanceKm]);

      const committeeIds = rawList.map(item => item.id);
      let eventsMap: Record<number, any[]> = {};

      if (committeeIds.length > 0) {
        const placeholders = committeeIds.map(() => '?').join(',');
        const eventRows = await query<any[]>(`
          SELECT 
            id AS eventId,
            committee_id AS committeeId,
            name,
            status,
            type,
            visibility,
            DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate
          FROM events
          WHERE committee_id IN (${placeholders})
            AND visibility = 'VISIBLE'
          ORDER BY start_date DESC, created_at DESC
        `, committeeIds);

        const eventIds = eventRows.map((e: any) => e.eventId);
        let bannersMap: Record<number, string[]> = {};
        if (eventIds.length > 0) {
          const bannerPlaceholders = eventIds.map(() => '?').join(',');
          const bannerRows = await query<any[]>(`
            SELECT event_id AS eventId, media_url AS mediaUrl
            FROM event_media_assets
            WHERE event_id IN (${bannerPlaceholders})
            ORDER BY sort_order ASC, id ASC
          `, eventIds);
          bannersMap = bannerRows.reduce((map: Record<number, string[]>, row: any) => {
            const eid = Number(row.eventId);
            if (!map[eid]) map[eid] = [];
            map[eid].push(row.mediaUrl);
            return map;
          }, {});
        }

        eventsMap = eventRows.reduce((map: Record<number, any[]>, event: any) => {
          const committeeId = Number(event.committeeId);
          if (!map[committeeId]) map[committeeId] = [];
          const banners = bannersMap[Number(event.eventId)] || [];
          map[committeeId].push(normalizeEventSummaryRow({ ...event, eventBanner: banners[0] || null, bannerImages: banners }));
          return map;
        }, {});
      }

      return rawList.map((item: any) => ({
        id: Number(item.id) || 0,
        address: item.address || '',
        committeeName: item.committee_name || '',
        contactNumbers: parseContactNumbers(item.contact_numbers),
        description: item.description || '',
        distanceMeters: Math.round((Number(item.distanceKm) || 0) * 1000),
        committeeLogo: item.logo || null,
        establishYear: Number(item.establish_year) || 0,
        events: eventsMap[item.id] || []
      }));
    }
  }
};
