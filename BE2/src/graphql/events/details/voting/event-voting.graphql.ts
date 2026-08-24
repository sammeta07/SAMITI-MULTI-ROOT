import { query } from '../../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { hasEventsVotingPhaseStateColumn } from './event-voting-phase-support';
import { hasEventsVotingModeColumn } from './event-voting-mode-support';
import { throwEventError, getLoggedInUserId, getEventVotingPhaseState, getMappedVotingRoles } from './event-voting-core.graphql';
import { getEventInterestApprovedPeople, getMyEventInterestRoleIds, getMyEventInterestStatuses, getEventAccessContext } from './event-interest.graphql';
import { getEventAccess } from './event-vote.graphql';
import { getEventMasterRoles } from '../event-details-by-id.graphql';

export const eventVotingDetailsTypes = `
  type EventVotingDetailsPayload {
    id: Int!
    eventId: Int!
    availableRoles: [EventAvailableRole!]!
    mappedVotingRoles: [EventMappedVotingRole!]!
    myInterestRoleIds: [Int!]!
    myInterestStatuses: [EventInterestStatus!]!
    interestApprovedPeople: [EventInterestInfo!]!
    pendingEventInterests: EventVotingPendingInterests
    myVotes: [MyEventVote!]
    canReviewInterest: Boolean!
    canManageVotingRoles: Boolean!
    committeeRole: String!
    votingPhaseState: Int!
    votingMode: String
  }

  type PendingEventInterest {
    id: Int!
    eventId: Int!
    roleId: Int!
    roleName: String
    userId: Int!
    userName: String!
    userEmail: String!
    userPhoto: String
    status: String!
    createdAt: String
  }

  type EventVotingPendingInterests {
    eventId: Int!
    pending: [PendingEventInterest!]!
  }

  type MyEventVote {
    roleId: Int!
    candidateId: Int!
    votedAt: String!
  }
`;

export const eventVotingDetailsQueryFields = `
  eventVotingDetails(id: Int!): EventVotingDetailsPayload!
`;

export const eventVotingDetailsResolvers = {
  Query: {
    async eventVotingDetails(_: any, args: { id: number }, context: any) {
      const eventId = Number(args?.id);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'id must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const supportsVotingPhaseState = await hasEventsVotingPhaseStateColumn();
      const supportsVotingMode = await hasEventsVotingModeColumn();

      const eventResult = await query<any[]>(`
        SELECT
          e.id,
          e.id AS eventId,
          e.committee_id AS committeeId
           ${supportsVotingPhaseState ? ', COALESCE(e.voting_phase_state, 0) AS votingPhaseState' : ', 0 AS votingPhaseState'}
           ${supportsVotingMode ? ', e.voting_mode AS votingMode' : ", 'VOTING' AS votingMode"}
        FROM events e
        WHERE e.id = ?
        LIMIT 1
      `, [eventId]);

      if (!eventResult || eventResult.length === 0) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventResult[0];
      const visibility = String(event.visibility || '').toUpperCase();

      const committeeMembership = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
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

      if (visibility === 'HIDDEN' && !hasCommitteeAccess) {
        throwEventError('FORBIDDEN', 'You are not allowed to access this event');
      }

      const canManageVotingRoles = Boolean(
        membership && (
          String(membership.committee_role || '') === 'COMMITTEE_ADMIN' ||
          String(membership.committee_role || '') === 'COMMITTEE_MASTER_ADMIN'
        )
      );
      const canSelfNominate = Boolean(membership && String(membership.committee_role || '') === 'COMMITTEE_MEMBER');
      const isCurrentUserMasterAdmin = Boolean(membership && String(membership.committee_role || '') === 'COMMITTEE_MASTER_ADMIN');
      const committeeRole = isCurrentUserMasterAdmin
        ? 'COMMITTEE_MASTER_ADMIN'
        : canManageVotingRoles
          ? 'COMMITTEE_ADMIN'
          : canSelfNominate
            ? 'COMMITTEE_MEMBER'
            : 'NONE';

      const availableRoles = await getEventMasterRoles();
      const mappedVotingRoleRows = await getMappedVotingRoles(eventId);

      const myInterestRoleIds = await getMyEventInterestRoleIds(eventId, loggedInUserId);
      const myInterestStatuses = await getMyEventInterestStatuses(eventId, loggedInUserId);

      const interestApprovedPeople: Array<{ roleId: number; approvedPeople: Array<{ userId: number; name: string; email: string; photo: string | null; committeeRole: string }> }> = [];
      for (const mappedRole of mappedVotingRoleRows) {
        const approvedPeople = await getEventInterestApprovedPeople(eventId, Number(mappedRole.roleId));
        interestApprovedPeople.push({ roleId: Number(mappedRole.roleId), approvedPeople });
      }

      return {
        id: Number(event.id),
        eventId: Number(event.eventId),
        availableRoles: availableRoles.map((roleRow) => ({
          roleId: roleRow.roleId,
          roleName: roleRow.roleName,
          roleCode: roleRow.roleCode,
          hindiName: roleRow.hindiName,
          englishName: roleRow.englishName
        })),
        mappedVotingRoles: mappedVotingRoleRows,
        myInterestRoleIds: Array.from(myInterestRoleIds),
        myInterestStatuses,
        interestApprovedPeople,
        pendingEventInterests: await getEventVotingPendingInterests(eventId, context),
        myVotes: await getEventVotingMyVotes(eventId, context),
        canReviewInterest: isCurrentUserMasterAdmin,
        canManageVotingRoles,
        committeeRole,
        votingPhaseState: getEventVotingPhaseState(event, supportsVotingPhaseState),
        votingMode: supportsVotingMode ? event?.votingMode || 'VOTING' : 'VOTING'
      };
    }
  }
};

async function getEventVotingPendingInterests(eventId: number, context: any): Promise<{
  eventId: number;
  pending: Array<{
    id: number;
    eventId: number;
    roleId: number;
    roleName: string | null;
    userId: number;
    userName: string;
    userEmail: string;
    userPhoto: string | null;
    status: string;
    createdAt: string | null;
  }>;
}> {
  const normalizedEventId = Number(eventId);
  if (!Number.isInteger(normalizedEventId) || normalizedEventId <= 0) {
    return { eventId: normalizedEventId, pending: [] };
  }

  let loggedInUserId = 0;
  try {
    loggedInUserId = await getLoggedInUserId(context);
  } catch {
    return { eventId: normalizedEventId, pending: [] };
  }

  const access = await getEventAccessContext(normalizedEventId, loggedInUserId);
  const canViewPending =
    access.isMasterAdmin ||
    (access.isCommitteeMember && access.votingPhaseState >= 1);
  if (!canViewPending) {
    return { eventId: normalizedEventId, pending: [] };
  }

  const pendingRows = await query<Array<RowDataPacket & {
    id: number;
    eventId: number;
    roleId: number;
    roleName: string | null;
    userId: number;
    userName: string;
    userEmail: string;
    userPhoto: string | null;
    status: string;
    createdAt: string;
  }>>(
    `SELECT
        eie.id AS id,
        eie.event_id AS eventId,
        eie.role_id AS roleId,
        erm.role_name AS roleName,
        eie.user_id AS userId,
        u.name AS userName,
        u.email AS userEmail,
        u.profile_photo AS userPhoto,
        eie.status AS status,
        DATE_FORMAT(eie.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
       FROM event_interest_expressions eie
       INNER JOIN users u ON u.id = eie.user_id
       LEFT JOIN events_roles_master erm ON erm.role_id = eie.role_id
       WHERE eie.event_id = ?
       ORDER BY eie.created_at ASC`,
     [normalizedEventId]
  );

  return {
    eventId: normalizedEventId,
    pending: pendingRows.map((row) => ({
      id: Number(row.id),
      eventId: Number(row.eventId),
      roleId: Number(row.roleId),
      roleName: row.roleName ? String(row.roleName) : null,
      userId: Number(row.userId),
      userName: String(row.userName || ''),
      userEmail: String(row.userEmail || ''),
      userPhoto: row.userPhoto ? String(row.userPhoto) : null,
      status: String(row.status || 'PENDING'),
      createdAt: row.createdAt || null
    }))
  };
}

async function getEventVotingMyVotes(eventId: number, context: any): Promise<Array<{
  roleId: number;
  candidateId: number;
  votedAt: string;
}>> {
  const normalizedEventId = Number(eventId);
  if (!Number.isInteger(normalizedEventId) || normalizedEventId <= 0) {
    return [];
  }

  let loggedInUserId = 0;
  try {
    loggedInUserId = await getLoggedInUserId(context);
  } catch {
    return [];
  }

  const access = await getEventAccess(normalizedEventId, loggedInUserId);
  if (!access.eventExists || !access.isCommitteeMember) {
    return [];
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
    [normalizedEventId, loggedInUserId]
  );

  return voteRows.map((row) => ({
    roleId: Number(row.roleId),
    candidateId: Number(row.candidateId),
    votedAt: String(row.votedAt || '')
  }));
}