export interface CommitteeProfileMeta {
  id?: number;
  committeeId?: number;
  committeeName: string;
  address: string;
  establishYear: number;
  logo: string | null;
  contactNumbers: string[];
  createdBy: number;
  createdAt: string;
}

export interface CommitteeRosterMember {
  id: number;
  name: string;
  email: string;
  photo?: string | null;
  isCommitteeAdmin: number; // 1 for true, 0 for false
}

export interface CommitteeEventListItem {
  id: number;
  eventId: number;
  committeeId: number;
  eventName: string;
  eventDisplayName: string;
  eventBanner?: string | null;
  status: string;
  category?: string | null;
  type: 'PUBLIC' | 'PRIVATE';
  visibility: string;
  startDate?: string | null;
  endDate?: string | null;
  createdBy: number;
  updatedBy?: number | null;
  createdAt?: string | null;
}

export interface UpdatedEventVisibilityPayload {
  eventId: number;
  visibility: 'VISIBLE' | 'HIDDEN';
  updatedBy: number;
}

export interface DeletedEventPayload {
  eventId: number;
  eventName: string;
  deletedBy: number;
  deletedAt: string;
}

export interface CommitteeDetailsPayload {
  id: number;
  committeeId: number;
  committeeName: string;
  address: string;
  establishYear: number;
  logo: string | null;
  contactNumbers: string[];
  createdBy: number;
  createdAt: string;
  isLoggedUserAdmin: boolean;
  loggedInUserAdminStatus: 'ACCEPTED' | 'PENDING' | 'REJECTED' | null;
  loggedInUserAdminStatusActionBy: number | null;
  loggedInUserAdminStatusActionAt: string | null;
  members: CommitteeRosterMember[];
}

export interface SubmitCommitteeMembershipRequestPayload {
  committeeId: number;
  requestedByUserId: number;
  requestedAtDateTime: string;
  requestedRole: CommitteeMembershipRequestRole;
  membershipStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | string;
}

export interface CancelCommitteeMembershipRequestPayload {
  committeeId: number;
  cancelledByUserId: number;
  cancelledAtDateTime: string;
  membershipStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null | string;
}

export type CommitteeMembershipRequestRole = 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN';
