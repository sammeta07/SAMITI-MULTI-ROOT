export interface EventProgramEntry {
  id: number;
  programId: number;
  eventId: number;
  programName: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  visibility: string;
  address?: string | null;
  programImage?: string | null;
}

export interface EventProgramsPayload {
  entries: EventProgramEntry[];
}
