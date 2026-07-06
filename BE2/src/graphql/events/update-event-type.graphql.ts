import { execute, query } from '../../config/db';

const ALLOWED_EVENT_TYPES = new Set(['PUBLIC', 'PRIVATE']);

function throwEventError(code: string, message: string): never {
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
    throwEventError('UNAUTHORIZED', 'Missing access token');
  }

  try {
    const decoded: any = await context.jwt.verify(accessToken);
    const loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);

    if (!Number.isInteger(loggedInUserId) || loggedInUserId <= 0) {
      throwEventError('UNAUTHORIZED', 'Invalid token payload');
    }

    return loggedInUserId;
  } catch {
    throwEventError('UNAUTHORIZED', 'Invalid or expired token');
  }
}

export const updateEventTypeTypes = `
  type UpdatedEventType {
    eventId: Int!
    type: String!
    updatedBy: Int!
  }
`;

export const updateEventTypeMutationFields = `
  updateEventType(eventId: Int!, type: String!): UpdatedEventType!
`;

export const updateEventTypeResolvers = {
  Mutation: {
    async updateEventType(_: any, args: { eventId: number; type: string }, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);
      const eventId = Number(args?.eventId);
      const eventType = String(args?.type || '').trim().toUpperCase();

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      if (!ALLOWED_EVENT_TYPES.has(eventType)) {
        throwEventError('BAD_REQUEST', 'Invalid type');
      }

      const eventRows = await query<any[]>(
        `SELECT id, committee_id AS committeeId
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      const event = eventRows[0];
      if (!event) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const adminCheck = await query<any[]>(
        `SELECT user_id
         FROM users_committees
         WHERE committee_id = ? AND user_id = ? AND is_committee_admin = 1
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      if (adminCheck.length === 0) {
        throwEventError('FORBIDDEN', 'Only committee admins can update event type');
      }

      await execute(
        `UPDATE events
         SET \`type\` = ?, updated_by = ?
         WHERE id = ?`,
        [eventType, loggedInUserId, eventId]
      );

      return {
        eventId,
        type: eventType,
        updatedBy: loggedInUserId
      };
    }
  }
};