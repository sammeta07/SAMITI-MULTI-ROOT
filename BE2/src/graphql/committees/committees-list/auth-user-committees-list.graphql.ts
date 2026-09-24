import { query } from '../../../config/db';
import { normalizeEventSummaryRow, parseContactNumbers } from './committee-list.helpers';
import { committeeYearInfoTypes } from './committee-year-info.graphql';

export const authCommitteeTypes = `
  type CommitteeAuth {
    id: Int!
    address: String!
    committeeName: String!
    contactNumbers: [String!]!
    distanceMeters: Float!
    committeeLogo: String
    establishYear: Int!
    committeeRole: String
    pendingRequestRole: String
    status: String
    isFavourite: Int!
    events: [EventSummary!]!
    availableYears: [CommitteeYearInfo!]!
  }
`;

export const authCommitteeQueryFields = `
    committeesListAuthUser(latitude: Float!, longitude: Float!, distanceKm: Float!, year: Int, committeeId: Int): [CommitteeAuth!]!
`;

export const authCommitteesResolvers = {
  Query: {
    async committeesListAuthUser(_: any, args: { latitude: number; longitude: number; distanceKm: number; year?: number; committeeId?: number }, context: any) {
      const { latitude, longitude, distanceKm, year, committeeId } = args;

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

      let rawList: any[] = [];

      if (committeeId) {
        const singleCommittee = await query<any[]>(`
          SELECT
            c.id,
            c.committee_name,
            c.establish_year,
            c.address,
            c.logo,
            c.contact_numbers,
            cm.committee_role AS committee_role,
            COALESCE(cm.is_favourite, 0)        AS is_favourite,
            crr.request_role                    AS pending_request_role,
            crr.status                          AS request_status,
            (6371 * acos(
              cos(radians(?)) * cos(radians(c.latitude)) * cos(radians(c.longitude) - radians(?)) +
              sin(radians(?)) * sin(radians(c.latitude))
            )) AS distanceKm
          FROM committees c
          LEFT JOIN users_committees cm ON c.id = cm.committee_id AND cm.user_id = ?
          LEFT JOIN committee_role_requests crr
            ON crr.id = (
              SELECT id
              FROM committee_role_requests crr2
              WHERE crr2.committee_id = c.id AND crr2.requester_user_id = ?
              ORDER BY crr2.requested_at DESC
              LIMIT 1
            )
          WHERE c.id = ?
        `, [latitude, longitude, latitude, loggedInUserId, loggedInUserId, committeeId]);

        rawList = singleCommittee;
      } else {
        const rawListResult = await query<any[]>(`
          SELECT
            c.id,
            c.committee_name,
            c.establish_year,
            c.address,
            c.logo,
            c.contact_numbers,
            cm.committee_role AS committee_role,
            COALESCE(cm.is_favourite, 0)        AS is_favourite,
            crr.request_role                    AS pending_request_role,
            crr.status                          AS request_status,
            (6371 * acos(
              cos(radians(?)) * cos(radians(c.latitude)) * cos(radians(c.longitude) - radians(?)) +
              sin(radians(?)) * sin(radians(c.latitude))
            )) AS distanceKm
          FROM committees c
          LEFT JOIN users_committees cm ON c.id = cm.committee_id AND cm.user_id = ?
          LEFT JOIN committee_role_requests crr
            ON crr.id = (
              SELECT id
              FROM committee_role_requests crr2
              WHERE crr2.committee_id = c.id AND crr2.requester_user_id = ?
              ORDER BY crr2.requested_at DESC
              LIMIT 1
            )
          HAVING distanceKm <= ?
          ORDER BY distanceKm ASC
        `, [latitude, longitude, latitude, loggedInUserId, loggedInUserId, distanceKm]);

        rawList = rawListResult;
      }

      const committeeIds = rawList.map(item => item.id);
      let eventsMap: Record<number, any[]> = {};

      if (committeeIds.length > 0) {
        const placeholders = committeeIds.map(() => '?').join(',');
        // Do not filter by selected year here. The UI needs the complete event history
        // to build a year-tab list with enabled/disabled states for past years and empty years.
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
          map[committeeIdNum].push(normalizeEventSummaryRow({
            ...event,
            eventName: event.eventName || event.name || '',
            eventBanner: banners[0] || null,
            bannerImages: banners
          }));
          return map;
        }, {});
      }

      const currentYear = new Date().getFullYear();

      return rawList.map((item: any) => {
        const role = String(item.committee_role || '').toUpperCase();
        const hasMembership =
          role === 'COMMITTEE_MASTER_ADMIN' ||
          role === 'COMMITTEE_ADMIN' ||
          role === 'COMMITTEE_MEMBER';
        const allEvents = eventsMap[item.id] || [];
        const visibleEvents = allEvents.filter((event) => event.visibility === 'VISIBLE');
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
          id: item.id,
          address: item.address || '',
          committeeName: item.committee_name || '',
          contactNumbers: parseContactNumbers(item.contact_numbers),
          distanceMeters: Math.round((Number(item.distanceKm) || 0) * 1000),
          committeeLogo: item.logo || null,
          establishYear: establishYear,
          committeeRole: item.committee_role || null,
          pendingRequestRole: item.pending_request_role || null,
          status: item.request_status || null,
          isFavourite: Number(item.is_favourite),
          events: hasMembership ? allEvents : visibleEvents,
          availableYears
        };
      });
    }
  }
};
