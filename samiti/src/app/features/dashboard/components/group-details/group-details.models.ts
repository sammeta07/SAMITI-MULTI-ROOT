export interface CommitteeProfileMeta {
  id?: number;
  committeeId?: number;
  committeeName: string;
  description: string;
  area: string;
  since: number;
  logo: string | null;
  contactNumbers: string[];
  createdBy: number;
  createdAt: string;
}

export interface CommitteeRosterMember {
  id: number;
  name: string;
  email: string;
  isCommitteeAdmin: number; // 1 for true, 0 for false
}

export interface CommitteeDetailsPayload {
  id: number;
  committeeId: number;
  committeeName: string;
  description: string;
  area: string;
  since: number;
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
  statusCode: number;
  status: string;
  message: string;
}

export interface CancelCommitteeMembershipRequestPayload {
  statusCode: number;
  status: string;
  message: string;
}

export type CommitteeMembershipRequestRole = 'COMITTEE_MEMBER' | 'COMITTEE_ADMIN';
