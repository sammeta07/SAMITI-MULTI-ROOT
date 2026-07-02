// Domain types for Dashboard Requests feature

export type CommitteeMembershipRequestType = 'COMITTEE_MEMBER' | 'COMITTEE_ADMIN';

export interface CommitteeMembershipRequesterUserDetails {
  user_id: number;
  name: string;
  email: string;
  mobile: string;
  date_of_birth: string;
  gender: string;
  photo: string | null;
}

export interface ReceivedCommitteeMembershipRequestItem {
  committee_id: number;
  committee_name: string;
  area: string | null;
  request_type: CommitteeMembershipRequestType;
  request_sent_time: string;
  user_details: CommitteeMembershipRequesterUserDetails;
}

export interface SentCommitteeMembershipRequestItem {
  committee_id: number;
  committee_name: string;
  request_type: CommitteeMembershipRequestType;
  area: string;
  since: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  request_sent_time: string;
  resolved_by_name: string | null;
  resolved_by_email: string | null;
  resolved_by_photo: string | null;
  resolved_at_time: string | null;
}

export interface ReceivedCommitteeMembershipRequestsResponse {
  statusCode: number;
  status: string;
  message: string;
  data: ReceivedCommitteeMembershipRequestItem[];
}

export interface SentCommitteeMembershipRequestsResponse {
  statusCode: number;
  status: string;
  message: string;
  data: SentCommitteeMembershipRequestItem[];
}

export interface TakeActionOnCommitteeMembershipRequestResponse {
  statusCode: number;
  status: string;
  message: string;
  error?: string;
}

export interface CancelSubmittedCommitteeMembershipRequestResponse {
  statusCode: number;
  status: string;
  message: string;
}

export interface TakeActionOnCommitteeMembershipRequestBody {
  committeeId: number;
  targetUserId: number;
  decisionAction: 'ACCEPTED' | 'REJECTED';
}

export interface ActionTakenOnCommitteeMembershipRequestItem {
  committee_id: number;
  committee_name: string;
  request_type: CommitteeMembershipRequestType;
  request_sent_time: string | null;
  action_at_time: string;
  status: 'ACCEPTED' | 'REJECTED';
  user_details: CommitteeMembershipRequesterUserDetails;
}

export interface ActionTakenOnCommitteeMembershipRequestsResponse {
  statusCode: number;
  status: string;
  message: string;
  data: ActionTakenOnCommitteeMembershipRequestItem[];
}