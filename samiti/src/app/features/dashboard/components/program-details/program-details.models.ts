export interface ProgramDetailsPayload {
  id: number;
  programId: number;
  eventId?: number | null;
  programName: string;
  description?: string | null;
  address?: string | null;
  status: string;
  visibility?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
}

export interface ProgramTask {
  id: number;
  taskName: string;
  status: string;
  assignedTo?: string | null;
}
