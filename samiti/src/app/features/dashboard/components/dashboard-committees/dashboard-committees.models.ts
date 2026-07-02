// ============================================================================
// Dashboard Committees Models - Data interfaces for committees feature
// ============================================================================

// ============================================================================
// 1. Committee Interface - Core entity representation
// ============================================================================
export interface Committee {
  committeeId: number;
  committeeName: string;
  logo: string | null;
  address: string;
  establishYear: number;
  isAdminPrivilege: boolean;
  membershipStatus: 'ACCEPTED' | 'PENDING' | 'REJECTED';
}

// ============================================================================
// 2. User Committees Response - API response for user's joined committees
// ============================================================================
export type UserCommitteesResponse = Committee[];

// ============================================================================
// 3. Committee Action Payload - For edit/delete operations
// ============================================================================
export interface CommitteeActionPayload {
  committeeId: number;
  action: 'edit' | 'delete';
}

// ============================================================================
// 4. Committee Action Response - API response for committee actions
// ============================================================================
export type CommitteeActionResponse = Record<string, any>;

// 🚀 Frontend Data Stream Structure Type Definition matching Backend JSON Packets
export interface MyCommitteeItem {
  committeeId: number;
  committeeName: string;
  establishYear: number;
  address: string;
  logo: string | null;
  membershipStatus: 'ACCEPTED' | string;
  isAdminPrivilege: boolean;
}

// Global API Standard Base Wrapper format mapping
export type MyCommitteesApiResponse = MyCommitteeItem[];

export interface BriefUserMeta {
  userId: number;
  name: string;
  email: string;
  mobile: string | null;
  photo: string | null;
}

export interface MyCommitteeDetailedItem {
  committeeId: number;
  committeeCode: string;
  committeeName: string;
  establishYear: number;
  address: string;
  logo: string | null;
  description: string;
  membershipStatus: string;
  isAdminPrivilege: boolean;
  adminsCount: number;
  membersCount: number;
  adminsBrief: BriefUserMeta[];
  membersBrief: BriefUserMeta[];
}

export type MyCommitteesDetailedApiResponse = MyCommitteeDetailedItem[];