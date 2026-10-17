import { query, execute } from '../../config/db';
import { getProgramLifecycleStatus } from './program-status';

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

function normalizeDate(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throwProgramError('BAD_REQUEST', `${fieldName} is required`);
  }

  const parsed = new Date(normalized + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) {
    throwProgramError('BAD_REQUEST', `${fieldName} must be a valid date`);
  }

  return parsed.toISOString().split('T')[0];
}

function normalizeTime(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throwProgramError('BAD_REQUEST', `${fieldName} is required`);
  }

  const parsed = new Date(`2000-01-01T${normalized}`);
  if (Number.isNaN(parsed.getTime())) {
    throwProgramError('BAD_REQUEST', `${fieldName} must be a valid time`);
  }

  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  const seconds = String(parsed.getSeconds()).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
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
    startDate: String!
    endDate: String!
    startTime: String!
    endTime: String!
    createdBy: Int!
    updatedBy: Int
    createdAt: String!
    price: Float!
  }

  input CreateProgramInput {
    eventId: Int!
    parentProgramId: Int
    programName: String!
    address: String
    visibility: String
    startDate: String!
    endDate: String!
    startTime: String!
    endTime: String!
    price: Float
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
      const parentProgramId = input.parentProgramId == null ? null : Number(input.parentProgramId);
      const programName = normalizeOptionalText(input.programName);
      const address = normalizeOptionalText(input.address);
      const visibility = normalizeVisibility(input.visibility);
      const startDate = normalizeDate(input.startDate, 'startDate');
      const endDate = normalizeDate(input.endDate, 'endDate');
      const startTime = normalizeTime(input.startTime, 'startTime');
      const endTime = normalizeTime(input.endTime, 'endTime');
      const hasPrice = input.price !== undefined && input.price !== null;
      const price = hasPrice ? Number(input.price) : 0;

      if (hasPrice && (!Number.isFinite(price) || price < 0)) {
        throwProgramError('BAD_REQUEST', 'price must be a non-negative number');
      }

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwProgramError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      if (parentProgramId !== null && (!Number.isInteger(parentProgramId) || parentProgramId <= 0)) {
        throwProgramError('BAD_REQUEST', 'parentProgramId must be a positive integer');
      }

      if (!programName) {
        throwProgramError('BAD_REQUEST', 'programName is required');
      }

      if (programName.length > 255) {
        throwProgramError('BAD_REQUEST', 'programName cannot exceed 255 characters');
      }

      if (startDate > endDate) {
        throwProgramError('BAD_REQUEST', 'startDate cannot be after endDate');
      }

      if (startTime >= endTime && startDate === endDate) {
        throwProgramError('BAD_REQUEST', 'startTime must be before endTime on the same day');
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
         WHERE committee_id = ? AND user_id = ? AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         LIMIT 1`,
        [Number(eventRow.committee_id), loggedInUserId]
      );

      if (adminRows.length === 0) {
        throwProgramError('FORBIDDEN', 'Only committee admins can create programs');
      }

      if (parentProgramId !== null) {
        const parentRows = await query<any[]>(
          `SELECT id
           FROM programs
           WHERE id = ? AND event_id = ?
           LIMIT 1`,
          [parentProgramId, eventId]
        );
        if (parentRows.length === 0) {
          throwProgramError('BAD_REQUEST', 'parentProgramId must belong to the selected event');
        }
      }

      const result = await execute(
        `INSERT INTO programs (
           event_id,
           parent_program_id,
           name,
           start_date,
           end_date,
           start_time,
           end_time,
           address,
           visibility,
           price,
           created_by,
           updated_by,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          eventId,
          parentProgramId,
          programName,
          startDate,
          endDate,
          startTime,
          endTime,
          address,
          visibility,
          price,
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
           DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
           DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate,
           start_time AS startTime,
           end_time AS endTime,
           address,
           visibility,
           created_by AS createdBy,
           updated_by AS updatedBy,
           created_at AS createdAt,
           price AS price
         FROM programs
         WHERE id = ?
         LIMIT 1`,
        [programId]
      );

      const createdProgram = createdRows[0];
      return createdProgram
        ? { ...createdProgram, status: getProgramLifecycleStatus(createdProgram.startDate, createdProgram.endDate) }
        : null;
    }
  }
};
