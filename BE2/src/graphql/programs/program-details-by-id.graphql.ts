import { RowDataPacket } from 'mysql2/promise';
import { query } from '../../config/db';

function throwProgramError(code: string, message: string): never {
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
  if (!accessToken) {
    throwProgramError('UNAUTHORIZED', 'Missing access token');
  }

  try {
    const decoded: any = await context.jwt.verify(accessToken);
    const loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);

    if (!Number.isInteger(loggedInUserId) || loggedInUserId <= 0) {
      throwProgramError('UNAUTHORIZED', 'Invalid token payload');
    }

    return loggedInUserId;
  } catch {
    throwProgramError('UNAUTHORIZED', 'Invalid or expired token');
  }
}

export const programDetailsTypes = `
  type ProgramDetails {
    id: Int!
    programId: Int!
    eventId: Int
    programName: String!
    programBanner: String
    bannerImages: [String!]!
    address: String
    status: String!
    visibility: String!
    startDate: String
    endDate: String
    createdBy: Int!
    updatedBy: Int
    createdAt: String
  }
`;

export const programDetailsQueryFields = `
  programDetails(id: Int!): ProgramDetails!
`;

export const programDetailsResolvers = {
  Query: {
    async programDetails(_: any, args: { id: number }, context: any) {
      const programId = Number(args?.id);
      if (!Number.isInteger(programId) || programId <= 0) {
        throwProgramError('BAD_REQUEST', 'id must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const programRows = await query<any[]>(
        `SELECT
           p.id,
           p.id AS programId,
           p.event_id AS eventId,
           p.name AS programName,
           p.address,
           p.status,
           p.visibility,
           DATE_FORMAT(p.start_date_time, '%Y-%m-%d %H:%i:%s') AS startDate,
           DATE_FORMAT(p.end_date_time, '%Y-%m-%d %H:%i:%s') AS endDate,
           p.created_by AS createdBy,
           p.updated_by AS updatedBy,
           p.created_at AS createdAt,
           e.committee_id AS committeeId
         FROM programs p
         LEFT JOIN events e ON e.id = p.event_id
         WHERE p.id = ?
         LIMIT 1`,
        [programId]
      );

      if (!programRows || programRows.length === 0) {
        throwProgramError('NOT_FOUND', 'Program not found');
      }

      const program = programRows[0];
      const visibility = String(program.visibility || '').toUpperCase();

      if (visibility === 'HIDDEN') {
        const committeeMembership = await query<any[]>(
          `SELECT is_committee_member, is_committee_admin
           FROM users_committees
           WHERE committee_id = ? AND user_id = ?
           LIMIT 1`,
          [Number(program.committeeId), loggedInUserId]
        );

        const membership = committeeMembership[0];
        const hasCommitteeAccess = Boolean(
          membership &&
          (Number(membership.is_committee_member) === 1 || Number(membership.is_committee_admin) === 1)
        );

        if (!hasCommitteeAccess) {
          throwProgramError('FORBIDDEN', 'You are not allowed to access this program');
        }
      }

      const bannerImageRows = await query<Array<RowDataPacket & { mediaUrl: string }>>(
        `SELECT media_url AS mediaUrl
         FROM program_media_assets
         WHERE program_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [programId]
      );

      return {
        id: program.id,
        programId: program.programId,
        eventId: program.eventId,
        programName: program.programName,
        programBanner: bannerImageRows[0]?.mediaUrl || null,
        bannerImages: bannerImageRows.map((row) => row.mediaUrl),
        address: program.address,
        status: program.status,
        visibility: program.visibility,
        startDate: program.startDate,
        endDate: program.endDate,
        createdBy: program.createdBy,
        updatedBy: program.updatedBy,
        createdAt: program.createdAt
      };
    }
  }
};
