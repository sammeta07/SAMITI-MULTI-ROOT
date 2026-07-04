export type ItemCategory = 'committee' | 'event' | 'program';

export type CancelRequestApiResponse = Record<string, any>;

export interface CommitteeListRequestBackend {
  distanceKm: number;
  latitude: number;
  longitude: number;
}

// Matches GraphQL type Committee (guest — limited fields)
export interface CommitteeEvent {
  eventId: number;
  eventName: string;
  status: string;
  type?: string | null;
  visibility: string;
  startDate?: string | null;
  endDate?: string | null;
  eventBanner?: string | null;
}

export interface CommitteeGuestItem {
  id: number;
  address: string;
  committeeName: string;
  contactNumbers: string[];
  description: string;
  distanceKm: number;
  committeeLogo: string | null;
  establishYear: number;
  events: CommitteeEvent[];
}

// Matches GraphQL type CommitteeAuth (logged-in — full fields)
export interface CommitteeAuthItem extends CommitteeGuestItem {
  isCommitteeAdmin: number;
  isCommitteeMember: number;
  // null = no pending request; 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' = pending
  pendingRequestRole: 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' | null;
  isFavourite: number;
}

// Union used in component
export type CommitteesList = CommitteeGuestItem | CommitteeAuthItem;

export type CommitteeListResponse = CommitteesList[];

// Keep for backward compat — same as CommitteeListResponse
export type CommitteeListResponseGuestUser = CommitteeListResponse;

export type JoinCommitteeApiResponse = Record<string, any>;

export type CommitteeMembershipRequestRole = 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN';

export interface SubmitCommitteeMembershipRequestInput {
  committeeId: number;
  requestRole: CommitteeMembershipRequestRole;
}

export interface JoinCommitteeRequestBody {
  committeeId: number;
  role: CommitteeMembershipRequestRole;
}

export interface ToggleCommitteeFavouriteResponse {
  committeeId: number;
  isFavourite: number;
}
