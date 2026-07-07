export interface CreateProgramPayload {
  eventId: number;
  programName: string;
  address?: string;
  visibility: 'VISIBLE' | 'HIDDEN';
  startDateTime: string;
  endDateTime: string;
}

export interface CreateProgramResponse {
  id: number;
  programId: number;
  eventId: number;
  programName: string;
  address?: string;
  visibility: string;
  startDateTime: string;
  endDateTime: string;
  createdBy: number;
  updatedBy?: number | null;
  createdAt: string;
}

export interface UpdateProgramPayload extends CreateProgramPayload {
  programId: number;
}

export interface UpdateProgramResponse {
  id: number;
  programId: number;
  eventId: number;
  programName: string;
  address?: string;
  status: string;
  visibility: string;
  startDateTime: string;
  endDateTime: string;
  createdBy: number;
  updatedBy?: number | null;
  createdAt: string;
}
