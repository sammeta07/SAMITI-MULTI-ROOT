import { execute, query } from '../../config/db';
import { getProgramLifecycleStatus } from './program-status';
import { hasPermission, PERMISSIONS } from '../../authorization/authorization';

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

export const updateProgramTypes = `
  type UpdatedProgram {
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

  input UpdateProgramInput {
    programId: Int!
    eventId: Int!
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

export const updateProgramMutationFields = `
  updateProgram(input: UpdateProgramInput!): UpdatedProgram
  deleteProgram(programId: Int!): Boolean!
`;

export const updateProgramResolvers = {
  Mutation: {
    async deleteProgram(_: any, args: { programId?: number }, context: any) {
      const programId = Number(args?.programId);
      if (!Number.isInteger(programId) || programId <= 0) {
        throwProgramError('BAD_REQUEST', 'programId must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const programRows = await query<any[]>(
        `SELECT p.parent_program_id AS parentProgramId,
                p.created_by AS createdBy,
                p.event_id AS eventId
         FROM programs p
         WHERE p.id = ?
         LIMIT 1`,
        [programId]
      );
      if (programRows.length === 0) {
        throwProgramError('NOT_FOUND', 'Program not found');
      }

      const program = programRows[0];
      const isMasterAdmin = await hasPermission(
        loggedInUserId,
        PERMISSIONS.PROGRAM_MANAGE_ANY,
        { type: 'EVENT', id: Number(program.eventId) }
      );
      const canDelete = program.parentProgramId == null
        ? await hasPermission(
          loggedInUserId,
          PERMISSIONS.PROGRAM_DELETE,
          { type: 'EVENT', id: Number(program.eventId) }
        )
        : isMasterAdmin || Number(program.createdBy) === loggedInUserId;
      if (!canDelete) {
        throwProgramError(
          'FORBIDDEN',
          program.parentProgramId == null
            ? 'Only Adhyaksha, Upadhyaksha, or a master admin can delete a root program'
            : 'Only the subprogram creator or a master admin can delete this subprogram'
        );
      }

      const result = await execute('DELETE FROM programs WHERE id = ?', [programId]);
      if (result.affectedRows !== 1) {
        throwProgramError('NOT_FOUND', 'Program not found');
      }
      return true;
    },

    async updateProgram(_: any, args: any, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);
      const input = args?.input || {};

      const programId = Number(input.programId);
      const eventId = Number(input.eventId);
      const programName = normalizeOptionalText(input.programName);
      const address = normalizeOptionalText(input.address);
      const visibility = normalizeVisibility(input.visibility);
      const startDate = normalizeDate(input.startDate, 'startDate');
      const endDate = normalizeDate(input.endDate, 'endDate');
      const startTime = normalizeTime(input.startTime, 'startTime');
      const endTime = normalizeTime(input.endTime, 'endTime');
      const hasPriceUpdate = input.price !== undefined && input.price !== null;
      const price = hasPriceUpdate ? Number(input.price) : null;

      if (hasPriceUpdate && (!Number.isFinite(price) || (price as number) < 0)) {
        throwProgramError('BAD_REQUEST', 'price must be a non-negative number');
      }

      if (!Number.isInteger(programId) || programId <= 0) {
        throwProgramError('BAD_REQUEST', 'programId must be a positive integer');
      }

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwProgramError('BAD_REQUEST', 'eventId must be a positive integer');
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

      const programRows = await query<any[]>(
        `SELECT p.id, p.event_id AS eventId
         FROM programs p
         WHERE p.id = ?
         LIMIT 1`,
        [programId]
      );

      if (programRows.length === 0) {
        throwProgramError('NOT_FOUND', 'Program not found');
      }

      const programRow = programRows[0];
      if (Number(programRow.eventId) !== eventId) {
        throwProgramError('BAD_REQUEST', 'eventId does not match selected program');
      }

      if (!await hasPermission(
        loggedInUserId,
        PERMISSIONS.PROGRAM_UPDATE,
        { type: 'EVENT', id: eventId }
      )) {
        throwProgramError('FORBIDDEN', 'Only Adhyaksha, Upadhyaksha, or a master admin can update programs');
      }

      const updateAssignments = [
        'name = ?',
        'start_date = ?',
        'end_date = ?',
        'start_time = ?',
        'end_time = ?',
        'address = ?',
        'visibility = ?'
      ];
      const updateParams: any[] = [
        programName,
        startDate,
        endDate,
        startTime,
        endTime,
        address,
        visibility
      ];

      if (hasPriceUpdate) {
        updateAssignments.push('price = ?');
        updateParams.push(price);
      }

      updateAssignments.push('updated_by = ?');
      updateParams.push(loggedInUserId, programId);

      await execute(
        `UPDATE programs
         SET ${updateAssignments.join(',\n             ')}
         WHERE id = ?`,
        updateParams
      );

      const updatedRows = await query<any[]>(
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
           price AS price,
           created_by AS createdBy,
           updated_by AS updatedBy,
           created_at AS createdAt
         FROM programs
         WHERE id = ?
         LIMIT 1`,
        [programId]
      );

      const updatedProgram = updatedRows[0];
      return updatedProgram
        ? { ...updatedProgram, status: getProgramLifecycleStatus(updatedProgram.startDate, updatedProgram.endDate) }
        : null;
    }
  }
};
