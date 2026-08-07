export interface EventAvailableRole {
  roleId?: number | null;
  roleName: string;
  roleCode?: string | null;
  hindiName?: string | null;
  englishName?: string | null;
}

export interface EventMappedVotingRole {
  roleId: number;
  roleName: string;
  hindiName?: string | null;
  englishName?: string | null;
  sortOrder: number;
  winnerUserId?: number | null;
  winnerName?: string | null;
  winnerPhoto?: string | null;
  winnerVoteCount?: number | null;
}

export interface EventInterestPerson {
  userId: number;
  name: string;
  email: string;
  photo?: string | null;
}

export interface EventInterestInfo {
  roleId: number;
  approvedPeople: EventInterestPerson[];
}

export interface EventInterestStatus {
  roleId: number;
  status: string;
}

export interface EventVoteMember {
  userId: number;
  name: string;
  email: string;
  photo?: string | null;
  committeeRole: string;
  hasVoted: boolean;
}

export interface EventVoteHistory {
  eventId: number;
  eventName: string;
  totalMembers: number;
  votedCount: number;
  notVotedCount: number;
  members: EventVoteMember[];
}

export interface CastEventVotePayload {
  eventId: number;
  roleId: number;
  voterId: number;
  candidateId: number;
  voted: boolean;
}

export interface MyEventVote {
  roleId: number;
  candidateId: number;
  votedAt: string;
}

export interface EventResultCandidate {
  userId: number;
  name: string;
  email: string;
  photo?: string | null;
  committeeRole: string;
  voteCount: number;
  isWinner: boolean;
}

export interface EventResultRole {
  roleId: number;
  roleName: string;
  totalVotes: number;
  candidates: EventResultCandidate[];
}

export interface EventResultsPayload {
  eventId: number;
  eventName: string;
  declaredAt: string;
  roles: EventResultRole[];
}

export interface ToggleEventVotingRolePayload {
  eventId: number;
  roleId: number;
  enabled: boolean;
  mappedVotingRoles: Array<{
    roleId: number;
    roleName: string;
    hindiName?: string | null;
    englishName?: string | null;
    sortOrder: number;
    winnerUserId?: number | null;
    winnerName?: string | null;
    winnerPhoto?: string | null;
    winnerVoteCount?: number | null;
  }>;
}

export interface LockEventVotingRolesPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface UnlockEventVotingRolesPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface StartEventNominationsPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface StopEventNominationsPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface AllowEventVotingPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface StopEventVotingPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface DeclareEventResultsPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface ResolveTieBreakerPayload {
  eventId: number;
  roleId: number;
  winnerUserId: number;
  winnerName: string;
  winnerPhoto: string | null;
  winnerVoteCount: number;
}

export interface VacateVotingRolePayload {
  eventId: number;
  roleId: number;
  success: boolean;
}

export interface AssignWinningRolePayload {
  eventId: number;
  roleId: number;
  winnerUserId: number;
  winnerName: string;
  winnerPhoto: string | null;
  winnerVoteCount: number;
  votingPhaseState: number;
}

export interface ExpressEventInterestPayload {
  eventId: number;
  roleId: number;
  expressed: boolean;
  myInterestRoleIds: number[];
  myInterestStatuses: Array<{ roleId: number; status: string }>;
}

export interface ReviewEventInterestPayload {
  eventId: number;
  roleId: number;
  userId: number;
  status: string;
  autoRejectedOthers?: boolean;
  previousDesignation?: string | null;
}

export interface PendingEventInterest {
  id: number;
  eventId: number;
  roleId: number;
  roleName?: string | null;
  userId: number;
  userName: string;
  userEmail: string;
  userPhoto?: string | null;
  status: string;
  createdAt?: string | null;
}

export interface EventInterestSummary {
  eventId: number;
  pending: PendingEventInterest[];
}

export interface EventVotingPayload {
  id: number;
  eventId: number;
  availableRoles: EventAvailableRole[];
  mappedVotingRoles: EventMappedVotingRole[];
  myInterestRoleIds: number[];
  myInterestStatuses: EventInterestStatus[];
  interestApprovedPeople: EventInterestInfo[];
  pendingEventInterests?: EventInterestSummary;
  myVotes?: MyEventVote[];
  canReviewInterest: boolean;
  canManageVotingRoles: boolean;
  currentCommitteeRole: string;
  votingPhaseState: number;
  votingMode?: 'VOTING' | 'DIRECT_ASSIGN';
}

export interface EventCommitteeMember {
  userId: number;
  name: string;
  email: string;
  photo?: string | null;
  committeeRole: string;
}

export interface EventDirectAssignMember {
  userId: number;
  name: string;
  email: string;
  photo?: string | null;
  committeeRole: string;
  isWinner: boolean;
}

export interface DirectAssignWinnerPayload {
  eventId: number;
  roleId: number;
  winnerUserId: number;
  winnerName: string;
  winnerPhoto?: string | null;
  winnerVoteCount: number;
  votingPhaseState: number;
}
