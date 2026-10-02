export interface CreateProgramPayload {
  eventId: number;
  programName: string;
  address?: string;
  visibility: 'VISIBLE' | 'HIDDEN';
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  isRecurring?: boolean;
}

export interface CreateProgramResponse {
  id: number;
  programId: number;
  eventId: number;
  programName: string;
  address?: string;
  visibility: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
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
  visibility: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  createdBy: number;
  updatedBy?: number | null;
  createdAt: string;
}
