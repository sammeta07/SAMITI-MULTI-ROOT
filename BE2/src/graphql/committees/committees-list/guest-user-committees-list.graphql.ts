import { query } from '../../../config/db';
import { normalizeEventSummaryRow, parseContactNumbers } from './committee-list.helpers';
import { committeeYearInfoTypes } from './committee-year-info.graphql';

export const guestCommitteeTypes = `
  type EventSummary {
    eventId: Int!
    eventName: String!
    eventYear: Int!
    category: String
    address: String
    eventLogo: String
    latitude: Float
    longitude: Float
    startDate: String
    endDate: String
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
      let eventYearsMap: Record<number, Set<number>> = {};
      const selectedYear = Number.isInteger(year) ? Number(year) : new Date().getFullYear();

      if (committeeIds.length > 0) {
        const placeholders = committeeIds.map(() => '?').join(',');
        const eventYearRows = await query<any[]>(`
          SELECT committee_id AS committeeId, YEAR(start_date) AS eventYear
          FROM events
          WHERE committee_id IN (${placeholders})
          GROUP BY committee_id, YEAR(start_date)
        `, committeeIds);

        eventYearsMap = eventYearRows.reduce((map: Record<number, Set<number>>, row: any) => {
          const committeeIdNum = Number(row.committeeId);
          if (!map[committeeIdNum]) map[committeeIdNum] = new Set<number>();
          map[committeeIdNum].add(Number(row.eventYear));
          return map;
        }, {});

        const eventRows = await query<any[]>(`
          SELECT 
            id AS eventId,
            committee_id AS committeeId,
            name,
            event_year AS eventYear,
            category,
            address,
            event_logo AS eventLogo,
            latitude,
            longitude,
            DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate
          FROM events
          WHERE committee_id IN (${placeholders})
            AND YEAR(start_date) = ?
            AND visibility = 'VISIBLE'
          ORDER BY start_date DESC, created_at DESC
        `, [...committeeIds, selectedYear]);

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
          map[committeeIdNum].push(normalizeEventSummaryRow({ ...event, bannerImages: banners }));
          return map;
        }, {});
      }

      const currentYear = new Date().getFullYear();

      return rawList.map((item: any) => {
        const allEvents = (eventsMap[item.id] || []).filter((event: any) => event.visibility !== 'HIDDEN');
        const establishYear = Number(item.establish_year) || currentYear;
        const yearsWithEvents = eventYearsMap[item.id] || new Set<number>();

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
