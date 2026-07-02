export type ItemCategory = 'committee' | 'event' | 'program';

export interface CancelRequestApiResponse {
  error?: string;
  message: string;
  status: string;
  statusCode: number;
}

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
  establishedYear: number;
  events: CommitteeEvent[];
}

// Matches GraphQL type CommitteeAuth (logged-in — full fields)
export interface CommitteeAuthItem extends CommitteeGuestItem {
  isCommitteeAdmin: number;
  isCommitteeMember: number;
  membershipStatus: string | null;
  membershipStatusActionBy: number | null;
  membershipStatusActionAt: string | null;
  adminStatus: string | null;
  adminStatusActionBy: number | null;
  adminStatusActionAt: string | null;
  isFavourite: number;
}

// Union used in component
export type CommitteesList = CommitteeGuestItem | CommitteeAuthItem;

export interface CommitteeListResponse {
  data: CommitteesList[];
  message: string;
  status: string;
  statusCode: number;
}

// Keep for backward compat — same as CommitteeListResponse
export type CommitteeListResponseGuestUser = CommitteeListResponse;

export interface JoinCommitteeApiResponse {
  error?: string;
  message: string;
  status: string;
  statusCode: number;
}

export type CommitteeMembershipRequestRole = 'COMITTEE_MEMBER' | 'COMITTEE_ADMIN';

export interface SubmitCommitteeMembershipRequestInput {
  committeeId: number;
  requestRole: CommitteeMembershipRequestRole;
}

export interface JoinComitteeRequestBody {
  committeeId: number;
  role: CommitteeMembershipRequestRole;
}

export interface ToggleCommitteeFavouriteResponse {
  statusCode: number;
  status: string;
  message: string;
  committeeId: number;
  isFavourite: number;
}
