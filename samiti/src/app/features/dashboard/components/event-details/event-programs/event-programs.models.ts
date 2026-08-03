export interface EventProgramSummary {
  id: number;
  programId: number;
  programName: string;
  status: string;
  visibility: string;
  startDate?: string | null;
  endDate?: string | null;
  programBanner?: string | null;
}

export interface EventProgramsPayload {
  eventId: number;
  programs: EventProgramSummary[];
}
