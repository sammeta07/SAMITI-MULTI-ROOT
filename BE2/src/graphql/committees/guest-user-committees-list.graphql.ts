import { query } from '../../config/db';

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
  }

  type Committee {
    id: Int!
    address: String!
    committeeName: String!
    contactNumbers: [String!]!
    description: String!
    distanceKm: Float!
    committeeLogo: String
    establishYear: Int!
    events: [EventSummary!]!
  }
`;

export const guestCommitteeQueryFields = `
    committeesListGuestUser(latitude: Float!, longitude: Float!, distanceKm: Float!): [Committee!]!
`;

export const guestCommitteesResolvers = {
  Query: {
    async committeesListGuestUser(_: any, args: { latitude: number; longitude: number; distanceKm: number }) {
      const { latitude, longitude, distanceKm } = args;
      const parseContactNumbers = (value: unknown): string[] => {
        if (Array.isArray(value)) {
          return value.map((item) => String(item).trim()).filter(Boolean);
        }

        if (typeof value === 'string' && value.trim()) {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
          } catch {
            return value.split(',').map((item) => item.trim()).filter(Boolean);
          }
        }

        return [];
      };

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
            DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate,
            event_banner AS eventBanner
          FROM events
          WHERE committee_id IN (${placeholders})
            AND visibility = 'VISIBLE'
          ORDER BY start_date DESC, created_at DESC
        `, committeeIds);

        eventsMap = eventRows.reduce((map: Record<number, any[]>, event: any) => {
          const committeeId = Number(event.committeeId);
          if (!map[committeeId]) {
            map[committeeId] = [];
          }
          map[committeeId].push(event);
          return map;
        }, {});
      }

      return rawList.map((item: any) => ({
        id: Number(item.id) || 0,
        address: item.address || '',
        committeeName: item.committee_name || '',
        contactNumbers: parseContactNumbers(item.contact_numbers),
        description: item.description || '',
        distanceKm: Number(item.distanceKm?.toFixed?.(2) ?? item.distanceKm ?? 0),
        committeeLogo: item.logo || null,
        establishYear: Number(item.establish_year) || 0,
        events: (eventsMap[item.id] || []).map((event) => ({
          eventId: Number(event.eventId) || 0,
          eventName: event.eventName || '',
          status: event.status || 'UPCOMING',
          type: event.type || null,
          visibility: event.visibility || 'VISIBLE',
          startDate: event.startDate || null,
          endDate: event.endDate || null,
          eventBanner: event.eventBanner || null
        }))
      }));
    }
  }
};
