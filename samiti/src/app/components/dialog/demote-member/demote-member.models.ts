export interface DemoteMemberDialogData {
  userId: string;
  committeeId: string;
  userName: string;
  currentRole: string;
  committeeName: string;
}

export interface DemoteMemberDialogResponse {
  confirmed: boolean;
}

export interface DemoteMemberPayload {
  userId: string;
  committeeId: string;
  newRole: string;
}

export interface DemoteMemberResponse {
  statusCode: number;
  message: string;
  data?: any;
}
