// ============================================================================
// 1. Core Request Payload Interface
// ============================================================================
export interface LoginPayload {
  email: string;
  password: string;
  fcmToken?: string | null;
}

export interface LoginUserData {
  id: number;
  name: string;
  email: string;
  dateOfBirth: string | null;
  gender: string | null;
  mobile: string | null;
  baseRole: string[];
  profilePhoto: string | null;
  fcmToken: string | null;
  accountRoles?: {
    committees: Array<{
      committeeId: number;
      committeeName: string;
      committeeLogo: string | null;
      committeeRole: string;
      roleLabel: string;
      isCommitteeAdmin: number;
      isCommitteeMember: number;
    }>;
    events: Array<{
      eventId: number;
      eventName: string;
      committeeId: number;
      committeeName: string;
      committeeLogo: string | null;
      designation: string;
      membershipStatus: string;
      eventStatus: string | null;
      eventVisibility: string | null;
    }>;
  };
}

export interface LoginResponse {
  token: string;
  user: LoginUserData;
}