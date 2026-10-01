import { query } from '../../../../config/db';
import { RowDataPacket } from 'mysql2/promise';

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

export const eventProgramsTypes = `
  type EventProgramEntry {
    id: Int!
    programId: Int!
    eventId: Int!
    programName: String!
    startDate: String!
    endDate: String!
    startTime: String!
    endTime: String!
    isRecurring: Boolean!
    visibility: String!
    address: String
    programImage: String
    ownerUserId: Int
    ownerName: String
    ownerAssignedBy: Int
    ownerAssignedAt: String
  }

  type EventProgramsPayload {
    entries: [EventProgramEntry!]!
  }
`;

export const eventProgramsQueryFields = `
  eventPrograms(eventId: Int!): EventProgramsPayload!
`;

export const eventProgramsResolvers = {
  Query: {
    async eventPrograms(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwProgramError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventRows = await query<any[]>(
        `SELECT id, committee_id, type
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (eventRows.length === 0) {
        throwProgramError('NOT_FOUND', 'Event not found');
      }

      const eventRow = eventRows[0];

      const committeeMembership = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(eventRow.committee_id), loggedInUserId]
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

      if (String(eventRow.type || '').toUpperCase() !== 'PUBLIC' && !hasCommitteeAccess) {
        throwProgramError('FORBIDDEN', 'You are not allowed to access this event');
      }

      const programRows = await query<any[]>(
        `SELECT
           p.id,
           p.id AS programId,
           p.event_id AS eventId,
           p.name AS programName,
           DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
           DATE_FORMAT(p.end_date, '%Y-%m-%d') AS endDate,
           TIME_FORMAT(p.start_time, '%H:%i:%s') AS startTime,
           TIME_FORMAT(p.end_time, '%H:%i:%s') AS endTime,
           p.is_recurring AS is_recurring,
           p.visibility,
           p.address,
           p.program_image AS program_image,
           p.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           p.owner_assigned_by AS ownerAssignedBy,
           DATE_FORMAT(p.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt
         FROM programs p
         LEFT JOIN users owner ON owner.id = p.owner_user_id
         WHERE p.event_id = ?
         ORDER BY p.start_date ASC, p.start_time ASC`,
        [eventId]
      );

      const entries: any[] = [];

      for (const program of programRows) {
        if (program.visibility === 'HIDDEN' && !hasCommitteeAccess) {
          continue;
        }

        const bannerImageRows = await query<Array<RowDataPacket & { mediaUrl: string }>>(
          `SELECT media_url AS mediaUrl
           FROM program_media_assets
           WHERE program_id = ?
           ORDER BY sort_order ASC, id ASC
           LIMIT 1`,
          [program.id]
        );

        const programWithImage = {
          ...program,
          program_image: bannerImageRows[0]?.mediaUrl || program.program_image
        };

        entries.push({
          id: program.id,
          programId: program.programId,
          eventId: program.eventId,
          programName: program.programName,
          startDate: program.startDate,
          endDate: program.endDate,
          startTime: program.startTime,
          endTime: program.endTime,
          isRecurring: Boolean(program.is_recurring),
          visibility: program.visibility,
          address: program.address,
          programImage: programWithImage.program_image,
          ownerUserId: program.ownerUserId === null ? null : Number(program.ownerUserId),
          ownerName: program.ownerName || null,
          ownerAssignedBy: program.ownerAssignedBy === null ? null : Number(program.ownerAssignedBy),
          ownerAssignedAt: program.ownerAssignedAt || null
        });
      }

      return {
        entries
      };
    }
  }
};
