export interface ExitCommitteeDialogData {
  userId: string;
  committeeId: string;
  userName: string;
  committeeName: string;
}

export interface ExitCommitteeDialogResponse {
  confirmed: boolean;
}

export interface ExitCommitteePayload {
  committeeId: string;
}

export interface ExitCommitteeResponse {
  statusCode: number;
  message: string;
  data?: any;
}
