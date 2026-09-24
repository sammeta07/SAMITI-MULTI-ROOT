import { query } from '../../../config/db';
import { normalizeEventSummaryRow, parseContactNumbers } from './committee-list.helpers';
import { committeeYearInfoTypes } from './committee-year-info.graphql';

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
    distanceMeters: Float!
    committeeLogo: String
    establishYear: Int!
    events: [EventSummary!]!
    availableYears: [CommitteeYearInfo!]!
  }
`;

export const guestCommitteeQueryFields = `
    committeesListGuestUser(latitude: Float!, longitude: Float!, distanceKm: Float!, year: Int, committeeId: Int): [Committee!]!
`;

export const guestCommitteesResolvers = {
  Query: {
    async committeesListGuestUser(_: any, args: { latitude: number; longitude: number; distanceKm: number; year?: number; committeeId?: number }) {
      const { latitude, longitude, distanceKm, year, committeeId } = args;

      let rawList: any[] = [];

      if (committeeId) {
        const singleCommittee = await query<any[]>(`
          SELECT
            id,
            committee_name,
            establish_year,
            address,
            logo,
            contact_numbers,
            (6371 * acos(
              cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) +
              sin(radians(?)) * sin(radians(latitude))
            )) AS distanceKm
          FROM committees
          WHERE id = ?
        `, [latitude, longitude, latitude, committeeId]);

        rawList = singleCommittee;
      } else {
        rawList = await query<any[]>(`
          SELECT 
            id,
            committee_name,
            establish_year,
            address,
            logo,
            contact_numbers,
            (6371 * acos(
              cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + 
              sin(radians(?)) * sin(radians(latitude))
            )) AS distanceKm
          FROM committees
          HAVING distanceKm <= ?
          ORDER BY distanceKm ASC
        `, [latitude, longitude, latitude, distanceKm]);
      }

      const committeeIds = rawList.map(item => item.id);
      let eventsMap: Record<number, any[]> = {};

      if (committeeIds.length > 0) {
        const placeholders = committeeIds.map(() => '?').join(',');
        // Keep all committee event rows here so the UI can build the full year-tab matrix
        // (past years, current year, empty years). The frontend already performs the
        // per-year filter when rendering the tab contents.
        const eventParams: any[] = [...committeeIds];

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
          ORDER BY start_date DESC, created_at DESC
        `, eventParams);

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
          const committeeIdNum = Number(event.committeeId);
          if (!map[committeeIdNum]) map[committeeIdNum] = [];
          const banners = bannersMap[Number(event.eventId)] || [];
          map[committeeIdNum].push(normalizeEventSummaryRow({ ...event, eventBanner: banners[0] || null, bannerImages: banners }));
          return map;
        }, {});
      }

      const currentYear = new Date().getFullYear();

      return rawList.map((item: any) => {
        const allEvents = eventsMap[item.id] || [];
        const establishYear = Number(item.establish_year) || currentYear;
        const yearsWithEvents = new Set<number>();
        for (const event of allEvents) {
          if (event.startDate) {
            const eventYear = new Date(event.startDate).getFullYear();
            if (!Number.isNaN(eventYear)) yearsWithEvents.add(eventYear);
          }
        }

        const availableYears: Array<{ year: number; hasEvents: boolean }> = [];
        for (let y = establishYear; y <= currentYear; y++) {
          availableYears.push({
            year: y,
            hasEvents: yearsWithEvents.has(y)
          });
        }

        return {
          id: Number(item.id) || 0,
          address: item.address || '',
          committeeName: item.committee_name || '',
          contactNumbers: parseContactNumbers(item.contact_numbers),
          distanceMeters: Math.round((Number(item.distanceKm) || 0) * 1000),
          committeeLogo: item.logo || null,
          establishYear: establishYear,
          events: allEvents,
          availableYears
        };
      });
    }
  }
};
