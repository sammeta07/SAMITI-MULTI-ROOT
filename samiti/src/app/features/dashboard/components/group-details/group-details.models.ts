export interface CommitteeProfileMeta {
  id?: number;
  committeeId?: number;
  committeeName: string;
  address: string;
  establishYear: number;
  logo: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contactNumbers: string[];
  createdBy: number;
  createdAt: string;
}

export interface CommitteeRosterMember {
  id: number;
  name: string;
  email: string;
  photo?: string | null;
  committeeRole?: 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' | 'COMMITTEE_MASTER_ADMIN' | null;
}

export interface EventDesignationPhoto {
  userId?: number;
  name?: string | null;
  photo?: string | null;
  designation?: string | null;
}

export interface CommitteeEventListItem {
  id: number;
  eventId: number;
  committeeId: number;
  eventName: string;
  eventDisplayName: string;
  eventLogo?: string | null;
  status: string;
  category?: string | null;
  type: 'PUBLIC' | 'PRIVATE';
  visibility: string;
  startDate?: string | null;
  endDate?: string | null;
  createdBy: number;
  updatedBy?: number | null;
  createdAt?: string | null;
  designationPhotos?: EventDesignationPhoto[];
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
  latitude: number | null;
  longitude: number | null;
  contactNumbers: string[];
  createdBy: number;
  createdAt: string;
  committeeRole: 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' | 'COMMITTEE_MASTER_ADMIN' | null;
  userRequestStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  userRequestRole: 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' | null;
  members: CommitteeRosterMember[];
  events: CommitteeEventListItem[];
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
