export interface ProgramDetailsPayload {
  id: number;
  programId: number;
  eventId?: number | null;
  programName: string;
  description?: string | null;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  createdBy?: number | null;
  createdAt?: string | null;
}

export interface ProgramTask {
  id: number;
  taskName: string;
  status: string;
  assignedTo?: string | null;
}
