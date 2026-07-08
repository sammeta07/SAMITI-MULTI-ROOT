import { execute, query } from '../../config/db';

const ALLOWED_EVENT_VISIBILITIES = new Set(['VISIBLE', 'HIDDEN']);

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

export const updateEventVisibilityTypes = `
  type UpdatedEventVisibility {
    eventId: Int!
    visibility: String!
    updatedBy: Int!
  }
`;

export const updateEventVisibilityMutationFields = `
  updateEventVisibility(eventId: Int!, visibility: String!): UpdatedEventVisibility!
`;

export const updateEventVisibilityResolvers = {
  Mutation: {
    async updateEventVisibility(_: any, args: { eventId: number; visibility: string }, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);
      const eventId = Number(args?.eventId);
      const visibility = String(args?.visibility || '').trim().toUpperCase();

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      if (!ALLOWED_EVENT_VISIBILITIES.has(visibility)) {
        throwEventError('BAD_REQUEST', 'Invalid visibility');
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
         WHERE committee_id = ? AND user_id = ? AND committee_role = 'COMMITTEE_ADMIN'
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      if (adminCheck.length === 0) {
        throwEventError('FORBIDDEN', 'Only committee admins can update event visibility');
      }

      await execute(
        `UPDATE events
         SET visibility = ?, updated_by = ?
         WHERE id = ?`,
        [visibility, loggedInUserId, eventId]
      );

      return {
        eventId,
        visibility,
        updatedBy: loggedInUserId
      };
    }
  }
};
