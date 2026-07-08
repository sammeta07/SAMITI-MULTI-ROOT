import { query, execute } from '../../config/db';

const ALLOWED_PROGRAM_VISIBILITIES = new Set(['VISIBLE', 'HIDDEN']);

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

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeVisibility(value: unknown): 'VISIBLE' | 'HIDDEN' {
  const normalized = (normalizeOptionalText(value) || 'VISIBLE').toUpperCase();
  if (!ALLOWED_PROGRAM_VISIBILITIES.has(normalized)) {
    throwProgramError('BAD_REQUEST', 'Invalid visibility');
  }

  return normalized as 'VISIBLE' | 'HIDDEN';
}

function normalizeDateTimeInput(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throwProgramError('BAD_REQUEST', `${fieldName} is required`);
  }

  const normalizedWithSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  const parsed = new Date(normalizedWithSeconds);
  if (Number.isNaN(parsed.getTime())) {
    throwProgramError('BAD_REQUEST', `${fieldName} must be a valid datetime`);
  }

  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

export const createProgramTypes = `
  type CreatedProgram {
    id: Int!
    programId: Int!
    eventId: Int!
    programName: String!
    address: String
    status: String!
    visibility: String!
    startDateTime: String!
    endDateTime: String!
    createdBy: Int!
    updatedBy: Int
    createdAt: String!
  }

  input CreateProgramInput {
    eventId: Int!
    programName: String!
    address: String
    visibility: String
    startDateTime: String!
    endDateTime: String!
  }
`;

export const createProgramMutationFields = `
  createProgram(input: CreateProgramInput!): CreatedProgram
`;

export const createProgramResolvers = {
  Mutation: {
    async createProgram(_: any, args: any, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);
      const input = args?.input || {};

      const eventId = Number(input.eventId);
      const programName = normalizeOptionalText(input.programName);
      const address = normalizeOptionalText(input.address);
      const visibility = normalizeVisibility(input.visibility);
      const startDateTime = normalizeDateTimeInput(input.startDateTime, 'startDateTime');
      const endDateTime = normalizeDateTimeInput(input.endDateTime, 'endDateTime');

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwProgramError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      if (!programName) {
        throwProgramError('BAD_REQUEST', 'programName is required');
      }

      if (programName.length > 255) {
        throwProgramError('BAD_REQUEST', 'programName cannot exceed 255 characters');
      }

      if (new Date(startDateTime) > new Date(endDateTime)) {
        throwProgramError('BAD_REQUEST', 'startDateTime cannot be after endDateTime');
      }

      const eventRows = await query<any[]>(
        `SELECT id, committee_id
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (eventRows.length === 0) {
        throwProgramError('NOT_FOUND', 'Event not found');
      }

      const eventRow = eventRows[0];
      const adminRows = await query<any[]>(
        `SELECT user_id
         FROM users_committees
         WHERE committee_id = ? AND user_id = ? AND committee_role = 'COMMITTEE_ADMIN'
         LIMIT 1`,
        [Number(eventRow.committee_id), loggedInUserId]
      );

      if (adminRows.length === 0) {
        throwProgramError('FORBIDDEN', 'Only committee admins can create programs');
      }

      const result = await execute(
        `INSERT INTO programs (
           event_id,
           name,
           start_date_time,
           end_date_time,
           address,
           status,
           visibility,
           created_by,
           updated_by,
           created_at
         ) VALUES (?, ?, ?, ?, ?, 'UPCOMING', ?, ?, ?, NOW())`,
        [
          eventId,
          programName,
          startDateTime,
          endDateTime,
          address,
          visibility,
          loggedInUserId,
          loggedInUserId
        ]
      );

      const programId = result.insertId;

      const createdRows = await query<any[]>(
        `SELECT
           id,
           id AS programId,
           event_id AS eventId,
           name AS programName,
           address,
           status,
           visibility,
           DATE_FORMAT(start_date_time, '%Y-%m-%dT%H:%i') AS startDateTime,
           DATE_FORMAT(end_date_time, '%Y-%m-%dT%H:%i') AS endDateTime,
           created_by AS createdBy,
           updated_by AS updatedBy,
           created_at AS createdAt
         FROM programs
         WHERE id = ?
         LIMIT 1`,
        [programId]
      );

      return createdRows[0] || null;
    }
  }
};