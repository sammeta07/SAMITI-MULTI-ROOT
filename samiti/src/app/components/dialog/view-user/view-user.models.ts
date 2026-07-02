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
  dateOfBirth: string;
  gender: string;
  profilePhoto: string | null;
  createdAt: string;
}

export interface UserCommitteeAffiliationSpec {
  committeeId: number;
  committeeName: string;
  logo: string | null;
  isCommitteeAdmin: number; // 🧱 1 for Admin role, 0 for Member role
}

export interface UserProgramOwnershipSpec {
  programId: number;
  programName: string;
  status: string;
  committeeId: number;
}

export interface UserTaskRowItemSpec {
  taskId: number;
  taskTitle: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED';
  dueDate: string;
  priority: string;
}

export interface UserTasksKPISummarySpec {
  totalAssigned: number;
  completed: number;
  pending: number;
  criticalOverdue: number;
  listing: UserTaskRowItemSpec[];
}

/**
 * 🪐 Centralized cluster payload for user analytics data aggregation
 */
export interface UserMasterKundaliResponsePayload {
  profile: UserBasicProfileSpec;
  associations: {
    committees: UserCommitteeAffiliationSpec[];
    programsOwned: UserProgramOwnershipSpec[];
  };
  kpiMetrics: {
    tasksSummary: UserTasksKPISummarySpec;
  };
}

// ── FIXED BRAND NEW RESPONSE API ENVELOPE STRUCTURING ─────────────────────────

/**
 * 🚀 FIXED: GraphQL response returning master aggregated data layout engine directly
 */
export type MemberDetailsResponse = UserMasterKundaliResponsePayload;