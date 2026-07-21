import { query } from '../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsVotingPhaseStateColumn } from './event-voting-phase-support';
import { throwEventError, getLoggedInUserId, getMappedVotingRoles } from './event-voting.graphql';

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

  type EventResultCandidate {
    userId: Int!
    name: String!
    email: String!
    photo: String
    committeeRole: String!
    voteCount: Int!
    isWinner: Boolean!
  }

  type EventResultRole {
    roleId: Int!
    roleName: String!
    totalVotes: Int!
    candidates: [EventResultCandidate!]!
  }

  type EventResultsPayload {
    eventId: Int!
    eventName: String!
    declaredAt: String!
    roles: [EventResultRole!]!
  }
`;

export const eventVoteQueryFields = `
  eventVoteHistory(eventId: Int!): EventVoteHistory!
  myEventVotes(eventId: Int!): MyEventVotesPayload!
  eventResults(eventId: Int!): EventResultsPayload!
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
    },

    async eventResults(_: any, args: { eventId: number }, context: any) {
      const eventId = Number(args?.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      let loggedInUserId = 0;
      try {
        loggedInUserId = await getLoggedInUserId(context);
      } catch {
        return { eventId, eventName: '', declaredAt: new Date().toISOString(), roles: [] };
      }

      const access = await getEventAccess(eventId, loggedInUserId);
      if (!access.eventExists) {
        throwEventError('NOT_FOUND', 'Event not found');
      }
      if (!access.isCommitteeMember) {
        throwEventError('FORBIDDEN', 'Only committee members can view results');
      }

      const eventRows = await query<Array<RowDataPacket & { eventName: string }>>(
        `SELECT name AS eventName FROM events WHERE id = ? LIMIT 1`,
        [eventId]
      );
      const eventName = eventRows[0]?.eventName ? String(eventRows[0].eventName) : '';

      const mappedVotingRoleRows = await getMappedVotingRoles(eventId);
      const mappedRoleIds = mappedVotingRoleRows.map((role: any) => Number(role.roleId)).filter((id: number) => Number.isInteger(id) && id > 0);

      const voteRows = await query<Array<RowDataPacket & {
        roleId: number;
        candidateId: number;
      }>>(
        `SELECT role_id AS roleId, candidate_id AS candidateId
           FROM event_votes
           WHERE event_id = ?`,
        [eventId]
      );

      const candidateIds = Array.from(new Set(voteRows.map((r) => Number(r.candidateId))));
      const roleIdsFromVotes = Array.from(new Set(voteRows.map((r) => Number(r.roleId))));
      const roleIds = Array.from(new Set([...mappedRoleIds, ...roleIdsFromVotes]));

      const candidateMap = new Map<number, { name: string; email: string; photo: string | null; committeeRole: string }>();
      if (candidateIds.length > 0) {
        const placeholders = candidateIds.map(() => '?').join(',');
        const candidateRows = await query<Array<RowDataPacket & {
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
            FROM users u
            LEFT JOIN users_committees c ON c.user_id = u.id AND c.committee_id = ?
            WHERE u.id IN (${placeholders})`,
          [access.committeeId, ...candidateIds]
        );

        candidateRows.forEach((row) => {
          candidateMap.set(Number(row.userId), {
            name: String(row.name || ''),
            email: String(row.email || ''),
            photo: row.photo ? String(row.photo) : null,
            committeeRole: String(row.committeeRole || 'COMMITTEE_MEMBER')
          });
        });
      }

      const roleNameMap = new Map<number, string>();
      if (mappedRoleIds.length > 0) {
        const placeholders = mappedRoleIds.map(() => '?').join(',');
        const roleRows = await query<Array<RowDataPacket & { roleId: number; roleName: string }>>(
          `SELECT role_id AS roleId, role_name AS roleName FROM events_roles_master WHERE role_id IN (${placeholders})`,
          mappedRoleIds
        );
        roleRows.forEach((row) => {
          roleNameMap.set(Number(row.roleId), String(row.roleName || ''));
        });
      }

      const roleStats = new Map<number, Map<number, number>>();
      voteRows.forEach((row) => {
        const roleId = Number(row.roleId);
        const candidateId = Number(row.candidateId);
        const candidateMap2 = roleStats.get(roleId) || new Map<number, number>();
        candidateMap2.set(candidateId, (candidateMap2.get(candidateId) || 0) + 1);
        roleStats.set(roleId, candidateMap2);
      });

      const singleCandidateMap = new Map<number, { userId: number; name: string; photo: string | null; committeeRole: string }>();
      if (mappedRoleIds.length > 0) {
        const placeholders = mappedRoleIds.map(() => '?').join(',');
        const singleCandidateRows = await query<Array<RowDataPacket & {
          roleId: number;
          userId: number;
          name: string;
          photo: string | null;
          committeeRole: string;
        }>>(
          `SELECT
              eie.role_id AS roleId,
              u.id AS userId,
              u.name AS name,
              u.profile_photo AS photo,
              c.committee_role AS committeeRole
            FROM event_interest_expressions eie
            INNER JOIN users u ON u.id = eie.user_id
            LEFT JOIN users_committees c ON c.user_id = u.id AND c.committee_id = ?
            WHERE eie.event_id = ? AND eie.role_id IN (${placeholders}) AND eie.status = 'APPROVED'
            GROUP BY eie.role_id, u.id, u.name, u.profile_photo, c.committee_role`,
          [access.committeeId, eventId, ...mappedRoleIds]
        );

        singleCandidateRows.forEach((row) => {
          const roleId = Number(row.roleId);
          singleCandidateMap.set(roleId, {
            userId: Number(row.userId),
            name: String(row.name || ''),
            photo: row.photo ? String(row.photo) : null,
            committeeRole: String(row.committeeRole || 'COMMITTEE_MEMBER')
          });
        });
      }

      const roles = roleIds.map((roleId) => {
        const candidateVotes = roleStats.get(roleId) || new Map<number, number>();
        const candidates = Array.from(candidateVotes.entries())
          .map(([candidateId, voteCount]) => {
            const info = candidateMap.get(candidateId) || { name: '', email: '', photo: null, committeeRole: 'COMMITTEE_MEMBER' };
            return {
              userId: candidateId,
              name: info.name,
              email: info.email,
              photo: info.photo,
              committeeRole: info.committeeRole,
              voteCount,
              isWinner: false
            };
          });

        const singleCandidate = singleCandidateMap.get(roleId);
        if (singleCandidate && !candidates.some((c) => c.userId === singleCandidate.userId)) {
          candidates.push({
            userId: singleCandidate.userId,
            name: singleCandidate.name,
            email: '',
            photo: singleCandidate.photo,
            committeeRole: singleCandidate.committeeRole,
            voteCount: 0,
            isWinner: false
          });
        }

        candidates.sort((a, b) => b.voteCount - a.voteCount);

        const maxVotes = candidates.length > 0 ? candidates[0].voteCount : 0;
        const hasSingleCandidate = candidates.length === 1;
        const winners = candidates.filter((c) => c.voteCount === maxVotes && (maxVotes > 0 || hasSingleCandidate));
        winners.forEach((w) => (w.isWinner = true));

        return {
          roleId,
          roleName: roleNameMap.get(roleId) || `Role ${roleId}`,
          totalVotes: candidates.reduce((sum, c) => sum + c.voteCount, 0),
          candidates
        };
      });

      return {
        eventId,
        eventName,
        declaredAt: new Date().toISOString(),
        roles
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
