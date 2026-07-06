// Domain types for Dashboard Requests feature
// Force recompile: v2

export type CommitteeMembershipRequestType = 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN';

export interface CommitteeMembershipRequesterUserDetails {
  userId: number;
  name: string;
  email: string;
  mobile: string;
  dateOfBirth: string;
  gender: string;
  photo: string | null;
}

export interface ReceivedCommitteeMembershipRequestItem {
  committeeId: number;
  committeeName: string;
  committeeLogo: string | null;
  address: string | null;
  actionByUserId: number | null;
  resolvedByName: string | null;
  resolvedByPhoto: string | null;
  requestType: CommitteeMembershipRequestType;
  requestSentTime: string;
  userDetails: CommitteeMembershipRequesterUserDetails;
}

export interface SentCommitteeMembershipRequestItem {
  committeeId: number;
  committeeName: string;
  committeeLogo: string | null;
  requesterUserId: number;
  requesterName: string | null;
  requesterPhoto: string | null;
  actionByUserId: number | null;
  requestType: CommitteeMembershipRequestType;
  address: string;
  establishYear: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  requestSentTime: string;
  resolvedByName: string | null;
  resolvedByEmail: string | null;
  resolvedByPhoto: string | null;
  resolvedAtTime: string | null;
}

export interface TakeActionOnCommitteeMembershipRequestResponse {
  committeeId: number;
  targetUserId: number;
  actionAtTime: string;
}

export interface CancelSubmittedCommitteeMembershipRequestResponse {
  committeeId: number;
  cancelledByUserId: number;
  cancelledAtDateTime: string;
  membershipStatus: string;
}

export interface TakeActionOnCommitteeMembershipRequestBody {
  committeeId: number;
  targetUserId: number;
  decisionAction: 'ACCEPTED' | 'REJECTED';
}

export interface ActionTakenOnCommitteeMembershipRequestItem {
  committeeId: number;
  committeeName: string;
  committeeLogo: string | null;
  actionByUserId: number | null;
  resolvedByName: string | null;
  resolvedByPhoto: string | null;
  requestType: CommitteeMembershipRequestType;
  requestSentTime: string | null;
  actionAtTime: string;
  status: 'ACCEPTED' | 'REJECTED';
  userDetails: CommitteeMembershipRequesterUserDetails;
}