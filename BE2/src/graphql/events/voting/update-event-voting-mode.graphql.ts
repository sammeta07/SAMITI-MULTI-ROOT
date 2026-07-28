import { execute, query } from '../../../config/db';
import { hasEventsVotingModeColumn } from './event-voting-mode-support';

const ALLOWED_VOTING_MODES = new Set(['VOTING', 'DIRECT_ASSIGN']);

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

export const updateEventVotingModeTypes = `
  type UpdateEventVotingModePayload {
    eventId: Int!
    votingMode: String!
  }
`;

export const updateEventVotingModeMutationFields = `
  updateEventVotingMode(eventId: Int!, mode: String!): UpdateEventVotingModePayload!
`;

export const updateEventVotingModeResolvers = {
  Mutation: {
    async updateEventVotingMode(_: any, args: { eventId: number; mode: string }, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);
      const eventId = Number(args?.eventId);
      const mode = String(args?.mode || '').trim().toUpperCase();

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      if (!ALLOWED_VOTING_MODES.has(mode)) {
        throwEventError('BAD_REQUEST', 'Invalid voting mode. Allowed values: VOTING, DIRECT_ASSIGN');
      }

      const supportsVotingMode = await hasEventsVotingModeColumn();
      if (!supportsVotingMode) {
        throwEventError('INTERNAL', 'Voting mode column is missing. Please run latest migrations.');
      }

      const eventRows = await query<any[]>(
        `SELECT id, committee_id AS committeeId
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventRows.length) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];

      const membershipRows = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      const isCommitteeAdmin = Boolean(
        membershipRows[0] && (
          String(membershipRows[0].committee_role || '') === 'COMMITTEE_ADMIN' ||
          String(membershipRows[0].committee_role || '') === 'COMMITTEE_MASTER_ADMIN'
        )
      );

      if (!isCommitteeAdmin) {
        throwEventError('FORBIDDEN', 'Only committee admin can update voting mode');
      }

      await execute(
        `UPDATE events
         SET voting_mode = ?, updated_by = ?
         WHERE id = ?`,
        [mode, loggedInUserId, eventId]
      );

      return {
        eventId,
        votingMode: mode
      };
    }
  }
};
