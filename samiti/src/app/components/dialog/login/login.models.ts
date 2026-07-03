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
}

export interface LoginDashboardTreeNode {
  id: string;
  name: string;
  type: string;
  roles: string[];
  children: LoginDashboardTreeNode[];
}

export interface LoginResponse {
  token: string;
  user: LoginUserData;
  dashboardTree: LoginDashboardTreeNode[];
}