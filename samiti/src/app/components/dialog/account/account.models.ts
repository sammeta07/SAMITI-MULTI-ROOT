// ============================================================================
// 1. Account Update Payload Interface
// ============================================================================
export interface AccountUpdatePayload {
  name: string;
  mobile: string;
  photo?: string;
}

// ============================================================================
// 2. Account Update Response Interface (GraphQL Response)
// ============================================================================
export interface AccountUpdateResponse {
  userId: number;
  name: string;
  email: string;
  mobile: string;
  photo?: string;
}

// ============================================================================
// 3. Account Roles Response Interfaces
// ============================================================================
export interface MyAccountCommitteeRoleItem {
  committeeId: number;
  committeeName: string;
  committeeLogo: string | null;
  committeeRole: string;
  roleLabel: string;
}

export interface MyAccountEventRoleItem {
  eventId: number;
  eventName: string;
  committeeId: number;
  committeeName: string;
  committeeLogo: string | null;
  designation: string;
  membershipStatus: string;
  eventStatus: string | null;
  eventVisibility: string | null;
}
