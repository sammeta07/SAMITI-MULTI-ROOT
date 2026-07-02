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
  statusCode: number;
  message: string;
  data?: any;
}

export interface MemberDataResponse {
  statusCode: number;
  message: string;
  data?: {
    user_id: string;
    name: string;
    email: string;
    mobile: string;
    role: string;
    photo?: string;
    date_of_birth?: string;
    gender?: string;
  };
}
