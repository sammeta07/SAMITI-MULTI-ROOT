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
  displayDateText: string;
  displayTimeText: string;
  displayBadge?: string | null;
}

export interface EventProgramsPayload {
  entries: EventProgramEntry[];
}
