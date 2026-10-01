import { query, execute } from '../../../../config/db';
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

function formatTime12Hour(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  const paddedMinutes = String(minutes).padStart(2, '0');
  return `${hours12}:${paddedMinutes} ${ampm}`;
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function buildProgramEntries(program: any): Array<{
  id: number;
  programId: number;
  eventId: number;
  programName: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  visibility: string;
  address: string | null;
  programImage: string | null;
  displayDateText: string;
  displayTimeText: string;
  displayBadge: string | null;
}> {
  const entries: Array<any> = [];

  if (program.is_recurring) {
    const startDate = new Date(program.start_date + 'T00:00:00');
    const endDate = new Date(program.end_date + 'T00:00:00');
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      entries.push({
        id: program.id,
        programId: program.programId,
        eventId: program.eventId,
        programName: program.programName,
        startDate: dateStr,
        endDate: dateStr,
        startTime: program.start_time,
        endTime: program.end_time,
        isRecurring: true,
        visibility: program.visibility,
        address: program.address,
        programImage: program.program_image,
        displayDateText: formatDateDisplay(dateStr),
        displayTimeText: `${formatTime12Hour(program.start_time)} - ${formatTime12Hour(program.end_time)}`,
        displayBadge: 'Daily'
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else {
    entries.push({
      id: program.id,
      programId: program.programId,
      eventId: program.eventId,
      programName: program.programName,
      startDate: program.start_date,
      endDate: program.end_date,
      startTime: program.start_time,
      endTime: program.end_time,
      isRecurring: false,
      visibility: program.visibility,
      address: program.address,
      programImage: program.program_image,
      displayDateText: formatDateDisplay(program.start_date),
      displayTimeText: `${formatTime12Hour(program.start_time)} - ${formatTime12Hour(program.end_time)}`,
      displayBadge: null
    });
  }

  return entries;
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
    displayDateText: String!
    displayTimeText: String!
    displayBadge: String
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
           id,
           id AS programId,
           event_id AS eventId,
           name AS programName,
           start_date AS start_date,
           end_date AS end_date,
           start_time AS start_time,
           end_time AS end_time,
           is_recurring AS is_recurring,
           visibility,
           address,
           program_image AS program_image
         FROM programs
         WHERE event_id = ?
         ORDER BY start_date ASC, start_time ASC`,
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

        entries.push(...buildProgramEntries(programWithImage));
      }

      return {
        entries
      };
    }
  }
};
