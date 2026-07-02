export interface PromoteMemberDialogData {
  userId: string;
  committeeId: string;
  userName: string;
  currentRole: string;
  committeeName: string;
}

export interface PromoteMemberDialogResponse {
  confirmed: boolean;
}

export interface PromoteMemberPayload {
  userId: string;
  committeeId: string;
  newRole: string;
}

export interface PromoteMemberResponse {
  userId: number;
  committeeId: number;
  role: string;
  updatedAt: string;
}

export interface MemberDataResponse {
  user_id: string;
  name: string;
  email: string;
  mobile: string;
  role: string;
  photo?: string;
  date_of_birth?: string;
  gender?: string;
}
