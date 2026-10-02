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
    visibility: String!
    startDate: String
    endDate: String
    startTime: String
    endTime: String
    isRecurring: Boolean
    createdBy: Int!
    updatedBy: Int
    createdAt: String
    ownerUserId: Int
    ownerName: String
    ownerAssignedBy: Int
    ownerAssignedAt: String
    canAssignOwner: Boolean!
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
           p.visibility,
           DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
           DATE_FORMAT(p.end_date, '%Y-%m-%d') AS endDate,
           p.start_time AS startTime,
           p.end_time AS endTime,
           p.is_recurring AS isRecurring,
           p.created_by AS createdBy,
           p.updated_by AS updatedBy,
           p.created_at AS createdAt,
           e.committee_id AS committeeId,
           p.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           p.owner_assigned_by AS ownerAssignedBy,
           DATE_FORMAT(p.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt
         FROM programs p
         LEFT JOIN events e ON e.id = p.event_id
         LEFT JOIN users owner ON owner.id = p.owner_user_id
         WHERE p.id = ?
         LIMIT 1`,
        [programId]
      );

      if (!programRows || programRows.length === 0) {
        throwProgramError('NOT_FOUND', 'Program not found');
      }

      const program = programRows[0];
      const visibility = String(program.visibility || '').toUpperCase();
      const ownerPermissionRows = await query<any[]>(
        `SELECT
           uc.committee_role AS committeeRole,
           EXISTS (
             SELECT 1
             FROM users_events ue
             LEFT JOIN events_roles_master erm ON erm.role_id = ue.role_id
             WHERE ue.event_id = ?
               AND ue.user_id = ?
               AND (
                 LOWER(TRIM(COALESCE(ue.designation, ''))) IN ('adhyaksha', 'upadhyaksha')
                 OR LOWER(TRIM(COALESCE(erm.english_name, ''))) IN ('adhyaksha', 'upadhyaksha')
                 OR LOWER(TRIM(COALESCE(erm.role_name, ''))) IN ('adhyaksha', 'upadhyaksha')
               )
           ) AS hasLeadershipDesignation
         FROM events e
         LEFT JOIN users_committees uc
           ON uc.committee_id = e.committee_id AND uc.user_id = ?
         WHERE e.id = ?
         LIMIT 1`,
        [Number(program.eventId), loggedInUserId, loggedInUserId, Number(program.eventId)]
      );
      const ownerPermission = ownerPermissionRows[0];
      const committeeRole = String(ownerPermission?.committeeRole || '').toUpperCase();
      const canAssignOwner = committeeRole === 'COMMITTEE_ADMIN' ||
        committeeRole === 'COMMITTEE_MASTER_ADMIN' ||
        Boolean(Number(ownerPermission?.hasLeadershipDesignation));

      if (visibility === 'HIDDEN') {
        const committeeMembership = await query<any[]>(
          `SELECT committee_role
           FROM users_committees
           WHERE committee_id = ? AND user_id = ?
           LIMIT 1`,
          [Number(program.committeeId), loggedInUserId]
        );

        const membership = committeeMembership[0];
        const hasCommitteeAccess = Boolean(
          membership &&
          (
            String(membership.committee_role || '') === 'COMMITTEE_MEMBER' ||
            String(membership.committee_role || '') === 'COMMITTEE_ADMIN' ||
            String(membership.committee_role || '') === 'COMMITTEE_MASTER_ADMIN'
          )
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
        visibility: program.visibility,
        startDate: program.startDate,
        endDate: program.endDate,
        startTime: program.startTime,
        endTime: program.endTime,
        isRecurring: program.isRecurring,
        createdBy: program.createdBy,
        updatedBy: program.updatedBy,
        createdAt: program.createdAt,
        ownerUserId: program.ownerUserId === null ? null : Number(program.ownerUserId),
        ownerName: program.ownerName || null,
        ownerAssignedBy: program.ownerAssignedBy === null ? null : Number(program.ownerAssignedBy),
        ownerAssignedAt: program.ownerAssignedAt || null,
        canAssignOwner
      };
    }
  }
};
