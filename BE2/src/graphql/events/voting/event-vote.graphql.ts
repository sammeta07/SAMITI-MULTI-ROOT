import { query } from '../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsVotingPhaseStateColumn } from './event-voting-phase-support';
import { throwEventError, getLoggedInUserId } from './event-voting.graphql';

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

async function getEventAccess(eventId: number, userId: number): Promise<{
  eventExists: boolean;
  committeeId: number;
  votingPhaseState: number;
  isCommitteeMember: boolean;
  isMasterAdmin: boolean;
}> {
  const rows = await query<Array<RowDataPacket & {
    committeeId: number;
    votingPhaseState: number;
    committeeRole: string | null;
  }>>(
    `SELECT
        e.committee_id AS committeeId,
        COALESCE(e.voting_phase_state, 0) AS votingPhaseState,
        c.committee_role AS committeeRole
      FROM events e
      LEFT JOIN users_committees c ON c.committee_id = e.committee_id AND c.user_id = ?
      WHERE e.id = ?
      LIMIT 1`,
    [userId, eventId]
  );

  if (!rows.length) {
    return { eventExists: false, committeeId: 0, votingPhaseState: 0, isCommitteeMember: false, isMasterAdmin: false };
  }

  const committeeRole = String(rows[0].committeeRole || '').toUpperCase();
  return {
    eventExists: true,
    committeeId: Number(rows[0].committeeId),
    votingPhaseState: Number(rows[0].votingPhaseState || 0),
    isCommitteeMember: committeeRole.length > 0,
    isMasterAdmin: committeeRole === 'COMMITTEE_MASTER_ADMIN'
  };
}

export const eventVoteTypes = `
  type EventVoteMember {
    userId: Int!
    name: String!
    email: String!
    photo: String
    committeeRole: String!
    hasVoted: Boolean!
  }

  type EventVoteHistory {
    eventId: Int!
    eventName: String!
    totalMembers: Int!
    votedCount: Int!
    notVotedCount: Int!
    members: [EventVoteMember!]!
  }

  type CastEventVotePayload {
    eventId: Int!
    roleId: Int!
    voterId: Int!
    candidateId: Int!
    voted: Boolean!
  }

  type MyEventVote {
    roleId: Int!
    candidateId: Int!
    votedAt: String!
  }

  type MyEventVotesPayload {
    eventId: Int!
    votes: [MyEventVote!]!
  }
`;

export const eventVoteQueryFields = `
  eventVoteHistory(eventId: Int!): EventVoteHistory!
  myEventVotes(eventId: Int!): MyEventVotesPayload!
`;

export const eventVoteMutationFields = `
  castEventVote(eventId: Int!, roleId: Int!, candidateId: Int!): CastEventVotePayload!
`;

export const eventVoteResolvers = {
  Query: {
    async eventVoteHistory(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      let loggedInUserId = 0;
      try {
        loggedInUserId = await getLoggedInUserId(context);
      } catch {
        return { eventId, eventName: '', totalMembers: 0, votedCount: 0, notVotedCount: 0, members: [] };
      }

      const access = await getEventAccess(eventId, loggedInUserId);
      if (!access.eventExists) {
        throwEventError('NOT_FOUND', 'Event not found');
      }
      if (!access.isCommitteeMember) {
        throwEventError('FORBIDDEN', 'Only committee members can view vote history');
      }

      const eventRows = await query<Array<RowDataPacket & { eventName: string }>>(
        `SELECT name AS eventName FROM events WHERE id = ? LIMIT 1`,
        [eventId]
      );
      const eventName = eventRows[0]?.eventName ? String(eventRows[0].eventName) : '';

      const memberRows = await query<Array<RowDataPacket & {
        userId: number;
        name: string;
        email: string;
        photo: string | null;
        committeeRole: string;
      }>>(
        `SELECT
            u.id AS userId,
            u.name AS name,
            u.email AS email,
            u.profile_photo AS photo,
            c.committee_role AS committeeRole
          FROM users_committees c
          INNER JOIN users u ON u.id = c.user_id
          WHERE c.committee_id = ?
          ORDER BY u.name ASC`,
        [access.committeeId]
      );

      const voterIds = memberRows.map((m) => Number(m.userId));
      const votedSet = new Set<number>();
      if (voterIds.length > 0) {
        const placeholders = voterIds.map(() => '?').join(',');
        const voteRows = await query<Array<RowDataPacket & { voterId: number }>>(
          `SELECT DISTINCT voter_id AS voterId
            FROM event_votes
            WHERE event_id = ? AND voter_id IN (${placeholders})`,
          [eventId, ...voterIds]
        );
        voteRows.forEach((v) => votedSet.add(Number(v.voterId)));
      }

      const members = memberRows.map((m) => ({
        userId: Number(m.userId),
        name: String(m.name || ''),
        email: String(m.email || ''),
        photo: m.photo ? String(m.photo) : null,
        committeeRole: String(m.committeeRole || 'COMMITTEE_MEMBER'),
        hasVoted: votedSet.has(Number(m.userId))
      }));

      const totalMembers = members.length;
      const votedCount = members.filter((m) => m.hasVoted).length;

      return {
        eventId,
        eventName,
        totalMembers,
        votedCount,
        notVotedCount: totalMembers - votedCount,
        members
      };
    },

    async myEventVotes(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      let loggedInUserId = 0;
      try {
        loggedInUserId = await getLoggedInUserId(context);
      } catch {
        return { eventId, votes: [] };
      }

      const access = await getEventAccess(eventId, loggedInUserId);
      if (!access.eventExists) {
        throwEventError('NOT_FOUND', 'Event not found');
      }
      if (!access.isCommitteeMember) {
        throwEventError('FORBIDDEN', 'Only committee members can view votes');
      }

      const voteRows = await query<Array<RowDataPacket & {
        roleId: number;
        candidateId: number;
        votedAt: string;
      }>>(
        `SELECT role_id AS roleId, candidate_id AS candidateId, created_at AS votedAt
          FROM event_votes
          WHERE event_id = ? AND voter_id = ?
          ORDER BY created_at ASC`,
        [eventId, loggedInUserId]
      );

      const votes = voteRows.map((row) => ({
        roleId: Number(row.roleId),
        candidateId: Number(row.candidateId),
        votedAt: String(row.votedAt || '')
      }));

      return {
        eventId,
        votes
      };
    }
  },

  Mutation: {
    async castEventVote(_: any, args: { eventId: number; roleId: number; candidateId: number }, context: any) {
      const eventId = Number(args?.eventId);
      const roleId = Number(args?.roleId);
      const candidateId = Number(args?.candidateId);

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }
      if (!Number.isInteger(roleId) || roleId <= 0) {
        throwEventError('BAD_REQUEST', 'roleId must be a positive integer');
      }
      if (!Number.isInteger(candidateId) || candidateId <= 0) {
        throwEventError('BAD_REQUEST', 'candidateId must be a positive integer');
      }

      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      if (!supportsVotingPhaseState) {
        throwEventError('INTERNAL', 'Voting phase column is missing. Please run latest migrations.');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const access = await getEventAccess(eventId, loggedInUserId);
      if (!access.eventExists) {
        throwEventError('NOT_FOUND', 'Event not found');
      }
      if (!access.isCommitteeMember) {
        throwEventError('FORBIDDEN', 'Only committee members can vote');
      }
      if (access.votingPhaseState !== 4) {
        throwEventError('BAD_REQUEST', 'Voting is not open for this event');
      }

      // Candidate must be an APPROVED interest expression for this role.
      const candidateRows = await query<Array<RowDataPacket & { id: number }>>(
        `SELECT id
          FROM event_interest_expressions
          WHERE event_id = ? AND role_id = ? AND user_id = ? AND status = 'APPROVED'
          LIMIT 1`,
        [eventId, roleId, candidateId]
      );
      if (!candidateRows.length) {
        throwEventError('BAD_REQUEST', 'Selected candidate is not an approved nominee for this role');
      }

      // Upsert: one vote per voter per role.
      await query(
        `INSERT INTO event_votes (event_id, role_id, voter_id, candidate_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE candidate_id = VALUES(candidate_id), updated_at = NOW()`,
        [eventId, roleId, loggedInUserId, candidateId]
      );

      return {
        eventId,
        roleId,
        voterId: loggedInUserId,
        candidateId,
        voted: true
      };
    }
  }
};
