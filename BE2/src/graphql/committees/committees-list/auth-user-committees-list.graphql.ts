import { query } from '../../../config/db';

export const authCommitteeTypes = `
  type CommitteeAuth {
    id: Int!
    address: String!
    committeeName: String!
    contactNumbers: [String!]!
    description: String!
    distanceKm: Float!
    committeeLogo: String
    establishYear: Int!
    isCommitteeAdmin: Int!
    isCommitteeMember: Int!
    pendingRequestRole: String
    isFavourite: Int!
    events: [EventSummary!]!
  }

`;

export const authCommitteeQueryFields = `
    committeesListAuthUser(latitude: Float!, longitude: Float!, distanceKm: Float!): [CommitteeAuth!]!
`;

export const authCommitteesResolvers = {
  Query: {
    async committeesListAuthUser(_: any, args: { latitude: number; longitude: number; distanceKm: number }, context: any) {
      const { latitude, longitude, distanceKm } = args;

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

      const rawList = await query<any[]>(`
        SELECT
          c.id,
          c.committee_name,
          c.establish_year,
          c.address,
          c.logo,
          c.contact_numbers,
          c.description,
          COALESCE(cm.is_committee_admin, 0)  AS is_committee_admin,
          COALESCE(cm.is_committee_member, 0) AS is_committee_member,
          COALESCE(cm.is_favourite, 0)        AS is_favourite,
          crr.request_role                    AS pending_request_role,
          (6371 * acos(
            cos(radians(?)) * cos(radians(c.latitude)) * cos(radians(c.longitude) - radians(?)) +
            sin(radians(?)) * sin(radians(c.latitude))
          )) AS distanceKm
        FROM committees c
        LEFT JOIN users_committees cm ON c.id = cm.committee_id AND cm.user_id = ?
        LEFT JOIN committee_role_requests crr
          ON crr.committee_id = c.id AND crr.requester_user_id = ? AND crr.status = 'PENDING'
        HAVING distanceKm <= ?
        ORDER BY distanceKm ASC
      `, [latitude, longitude, latitude, loggedInUserId, loggedInUserId, distanceKm]);

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

      return rawList.map((item: any) => {
        const isAdmin = Number(item.is_committee_admin) === 1;
        const isMember = Number(item.is_committee_member) === 1;
        const allEvents = eventsMap[item.id] || [];
        const visibleEvents = allEvents.filter((event) => event.visibility === 'VISIBLE');

        return {
          id: item.id,
          address: item.address || '',
          committeeName: item.committee_name || '',
          contactNumbers: typeof item.contact_numbers === 'string' ? JSON.parse(item.contact_numbers) : (item.contact_numbers || []),
          description: item.description || '',
          distanceKm: Number(item.distanceKm?.toFixed?.(2) ?? item.distanceKm ?? 0),
          committeeLogo: item.logo || null,
          establishYear: item.establish_year ?? 0,
          isCommitteeAdmin: Number(item.is_committee_admin),
          isCommitteeMember: Number(item.is_committee_member),
          pendingRequestRole: item.pending_request_role || null,
          isFavourite: Number(item.is_favourite),
          events: (isAdmin || isMember) ? allEvents : visibleEvents
        };
      });
    }
  }
};
