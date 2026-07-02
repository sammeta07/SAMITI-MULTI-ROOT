export interface RemoveMemberDialogData {
  userId: string;
  committeeId: string;
  userName: string;
  committeeName: string;
}

export interface RemoveMemberDialogResponse {
  confirmed: boolean;
}

export interface RemoveMemberPayload {
  userId: string;
  committeeId: string;
}

export interface RemoveMemberResponse {
  userId: number;
  committeeId: number;
  removedAt: string;
}
