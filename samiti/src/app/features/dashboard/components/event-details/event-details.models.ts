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
  nominationCount: number;
  isNominatedByCurrentUser: boolean;
  nominees: Array<{
    userId: number;
    name: string;
    email: string;
    photo?: string | null;
  }>;
}
export interface EventPerson {
  id: number;
  name: string;
  email: string;
  photo?: string | null;
}

export interface EventParticipant {
  userId: number;
  name: string;
  email: string;
  photo?: string | null;
  designation: string;
  membershipStatus: string;
}

export interface EventDesignationSummary {
  designation: string;
  memberCount: number;
}

export interface EventProgramSummary {
  id: number;
  programId: number;
  programName: string;
  status: string;
  visibility: string;
  startDate?: string | null;
  endDate?: string | null;
  programBanner?: string | null;
}

export interface EventDetailsPayload {
  id: number;
  eventId: number;
  committeeId?: number | null;
  committeeAddress?: string | null;
  eventName: string;
  eventDisplayName: string;
  eventBanner?: string | null;
  bannerImages: string[];
  status: string;
  category?: string | null;
  visibility: string;
  type?: 'PUBLIC' | 'PRIVATE' | string;
  startDate?: string | null;
  endDate?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdBy: number;
  updatedBy?: number | null;
  createdAt?: string | null;
  programs: EventProgramSummary[];
  eventParticipants: EventParticipant[];
  designationSummary: EventDesignationSummary[];
  eligibleVoterCount: number;
  availableRoles: EventAvailableRole[];
  mappedVotingRoles: EventMappedVotingRole[];
  canManageVotingRoles: boolean;
  canSelfNominate: boolean;
  currentCommitteeRole: string;
  committeeMemberCount: number;
  committeeAdminCount: number;
  votingRolesLocked: boolean;
  votingEnabled: boolean;
  votingClosed: boolean;
  votingPhaseState: number;
  totalNominations: number;
  myNominatedRoleId?: number | null;
}