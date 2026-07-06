export interface CreateProgramPayload {
  eventId: number;
  programName: string;
  description?: string;
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  startDate: string | null;
  endDate: string | null;
}

export interface CreateProgramResponse {
  id: number;
  programId: number;
  eventId: number;
  programName: string;
  description?: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdBy: number;
  createdAt: string;
}
