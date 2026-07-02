// ============================================================================
// Dashboard Committees Models - Data interfaces for committees feature
// ============================================================================

// ============================================================================
// 1. Committee Interface - Core entity representation
// ============================================================================
export interface Committee {
  committee_id: number;
  committee_name: string;
  logo: string | null;
  area: string;
  since: number;
  is_admin_privilege: boolean;
  membership_status: 'ACCEPTED' | 'PENDING' | 'REJECTED';
}

// ============================================================================
// 2. User Committees Response - API response for user's joined committees
// ============================================================================
export type UserCommitteesResponse = Committee[];

// ============================================================================
// 3. Committee Action Payload - For edit/delete operations
// ============================================================================
export interface CommitteeActionPayload {
  committee_id: number;
  action: 'edit' | 'delete';
}

// ============================================================================
// 4. Committee Action Response - API response for committee actions
// ============================================================================
export type CommitteeActionResponse = Record<string, any>;

// 🚀 Frontend Data Stream Structure Type Definition matching Backend JSON Packets
export interface MyCommitteeItem {
  committee_id: number;
  committee_name: string;
  since: number;
  area: string;
  logo: string | null;
  membership_status: 'ACCEPTED' | string;
  is_admin_privilege: boolean;
}

// Global API Standard Base Wrapper format mapping
export type MyCommitteesApiResponse = MyCommitteeItem[];

export interface BriefUserMeta {
  user_id: number;
  name: string;
  email: string;
  mobile: string | null;
  photo: string | null;
}

export interface MyCommitteeDetailedItem {
  committee_id: number;
  committee_code: string;
  committee_name: string;
  since: number;
  area: string;
  logo: string | null;
  description: string;
  membership_status: string;
  is_admin_privilege: boolean;
  admins_count: number;
  members_count: number;
  admins_brief: BriefUserMeta[];
  members_brief: BriefUserMeta[];
}

export type MyCommitteesDetailedApiResponse = MyCommitteeDetailedItem[];