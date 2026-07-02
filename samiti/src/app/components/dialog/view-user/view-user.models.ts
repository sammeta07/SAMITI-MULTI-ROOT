// ── NEW UNIFIED USER MASTER KUNDALI MODEL BLUEPRINT ──────────────────────────

/**
 * 🪐 Injected data model when opening the dialog overlay tracker desk
 */
export interface ViewUserDialogData {
  userId: string;
  committeeId: string;
  userName: string;
  userEmail?: string;
  isAdmin?: boolean;
  committeeName: string;
}

/**
 * 🪐 Dialog closing status indicator reference mapping
 */
export interface ViewUserDialogResponse {
  closed: boolean;
}

// ── CORE DATA NESTED COMPONENTS ATOMIC MATRIX ─────────────────────────────────

export interface UserBasicProfileSpec {
  id: number;
  name: string;
  email: string;
  mobile: string;
  date_of_birth: string;
  gender: string;
  profile_photo: string | null; // 🚀 Matches your exact raw DB payload field link
  created_at: string;
}

export interface UserCommitteeAffiliationSpec {
  committee_id: number;
  committee_name: string;
  logo: string | null;
  is_committee_admin: number; // 🧱 1 for Admin role, 0 for Member role
}

export interface UserProgramOwnershipSpec {
  program_id: number;
  program_name: string;
  status: string;
  committee_id: number;
}

export interface UserTaskRowItemSpec {
  task_id: number;
  task_title: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED';
  due_date: string;
  priority: string;
}

export interface UserTasksKPISummarySpec {
  total_assigned: number;
  completed: number;
  pending: number;
  critical_overdue: number;
  listing: UserTaskRowItemSpec[];
}

/**
 * 🪐 Centralized cluster payload for user analytics data aggregation
 */
export interface UserMasterKundaliResponsePayload {
  profile: UserBasicProfileSpec;
  associations: {
    committees: UserCommitteeAffiliationSpec[];
    programs_owned: UserProgramOwnershipSpec[];
  };
  kpi_metrics: {
    tasks_summary: UserTasksKPISummarySpec;
  };
}

// ── FIXED BRAND NEW RESPONSE API ENVELOPE STRUCTURING ─────────────────────────

/**
 * 🚀 FIXED: Rewritten MemberDetailsResponse mapping your live analytics dataset flawlessly
 */
export interface MemberDetailsResponse {
  statusCode: number;
  status: string;
  message: string;
  data?: UserMasterKundaliResponsePayload; // Injected new master aggregated data layout engine
}