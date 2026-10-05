import { query } from '../../config/db';

type ProgramStatusFilter = 'LIVE' | 'UPCOMING' | 'COMPLETED';

const validProgramStatuses: ProgramStatusFilter[] = ['LIVE', 'UPCOMING', 'COMPLETED'];

export const programsByDistanceTypes = `
  type NearbyProgram {
    id: Int!
    programName: String!
    category: String
    address: String
    programLogo: String
    latitude: Float
    longitude: Float
    startDate: String
    endDate: String
    startTime: String
    endTime: String
    isRecurring: Boolean!
    bannerImages: [String!]!
    distanceMeters: Float!
    committeeName: String!
    committeeId: Int!
  }
`;

export const programsByDistanceQueryFields = `
  programsByDistance(latitude: Float!, longitude: Float!, distanceKm: Float!, year: Int!, status: String!): [NearbyProgram!]!
`;

export const programsByDistanceResolvers = {
  Query: {
    async programsByDistance(
      _: any,
      args: {
        latitude: number;
        longitude: number;
        distanceKm: number;
        year: number;
        status: string;
      }
    ) {
      const { latitude, longitude, distanceKm, year } = args;
      const status = String(args.status || '').toUpperCase() as ProgramStatusFilter;

      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        throw new Error('BAD_REQUEST: latitude must be between -90 and 90');
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error('BAD_REQUEST: longitude must be between -180 and 180');
      }
      if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
        throw new Error('BAD_REQUEST: distanceKm must be greater than zero');
      }
      if (!Number.isInteger(year) || year < 1900 || year > 9999) {
        throw new Error('BAD_REQUEST: year must be a valid four-digit year');
      }
      if (!validProgramStatuses.includes(status)) {
        throw new Error('BAD_REQUEST: status must be LIVE, UPCOMING, or COMPLETED');
      }

      const statusCondition = {
        LIVE: `TIMESTAMP(p.start_date, p.start_time) <= CURRENT_TIMESTAMP
          AND TIMESTAMP(p.end_date, p.end_time) >= CURRENT_TIMESTAMP`,
        UPCOMING: 'TIMESTAMP(p.start_date, p.start_time) > CURRENT_TIMESTAMP',
        COMPLETED: 'TIMESTAMP(p.end_date, p.end_time) < CURRENT_TIMESTAMP'
      }[status];

      const programRows = await query<any[]>(
        `SELECT
           p.id,
           p.name AS programName,
           e.category,
           COALESCE(NULLIF(TRIM(p.address), ''), e.address) AS address,
           p.program_image AS programLogo,
           e.latitude,
           e.longitude,
           DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
           DATE_FORMAT(p.end_date, '%Y-%m-%d') AS endDate,
           TIME_FORMAT(p.start_time, '%H:%i:%s') AS startTime,
           TIME_FORMAT(p.end_time, '%H:%i:%s') AS endTime,
           p.is_recurring AS isRecurring,
           (6371 * ACOS(LEAST(1, GREATEST(-1,
             COS(RADIANS(?)) * COS(RADIANS(e.latitude)) *
             COS(RADIANS(e.longitude) - RADIANS(?)) +
             SIN(RADIANS(?)) * SIN(RADIANS(e.latitude))
           )))) AS distanceKm,
           c.committee_name AS committeeName,
           c.id AS committeeId
         FROM programs p
         INNER JOIN events e ON e.id = p.event_id
         INNER JOIN committees c ON c.id = e.committee_id
         WHERE e.type = 'PUBLIC'
           AND UPPER(COALESCE(p.visibility, 'VISIBLE')) = 'VISIBLE'
           AND e.latitude IS NOT NULL
           AND e.longitude IS NOT NULL
           AND YEAR(p.start_date) = ?
           AND ${statusCondition}
         HAVING distanceKm <= ?
         ORDER BY distanceKm ASC, p.start_date ASC, p.start_time ASC`,
        [latitude, longitude, latitude, year, distanceKm]
      );

      const programIds = programRows.map((program) => Number(program.id));
      const bannerImagesByProgram: Record<number, string[]> = {};

      if (programIds.length > 0) {
        const placeholders = programIds.map(() => '?').join(',');
        const bannerRows = await query<any[]>(
          `SELECT program_id AS programId, media_url AS mediaUrl
           FROM program_media_assets
           WHERE program_id IN (${placeholders})
           ORDER BY sort_order ASC, id ASC`,
          programIds
        );

        for (const banner of bannerRows) {
          const programId = Number(banner.programId);
          (bannerImagesByProgram[programId] ??= []).push(banner.mediaUrl);
        }
      }

      return programRows.map((program) => ({
        id: Number(program.id),
        programName: program.programName,
        category: program.category || null,
        address: program.address || null,
        programLogo: program.programLogo || null,
        latitude: program.latitude === null ? null : Number(program.latitude),
        longitude: program.longitude === null ? null : Number(program.longitude),
        startDate: program.startDate || null,
        endDate: program.endDate || null,
        startTime: program.startTime || null,
        endTime: program.endTime || null,
        isRecurring: Number(program.isRecurring) === 1,
        bannerImages: bannerImagesByProgram[Number(program.id)] || [],
        distanceMeters: Math.round(Number(program.distanceKm) * 1000),
        committeeName: program.committeeName,
        committeeId: Number(program.committeeId)
      }));
    }
  }
};
