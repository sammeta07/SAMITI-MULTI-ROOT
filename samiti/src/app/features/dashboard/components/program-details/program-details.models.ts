export interface ProgramDetailsPayload {
  id: number;
  programId: number;
  eventId?: number | null;
  programName: string;
  programBanner?: string | null;
  bannerImages: string[];
  address?: string | null;
  visibility?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isRecurring?: boolean | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  ownerUserId?: number | null;
  ownerName?: string | null;
  ownerAssignedBy?: number | null;
  ownerAssignedAt?: string | null;
  canAssignOwner: boolean;
}

export interface ProgramTask {
  id: number;
  taskName: string;
  status: string;
  assignedTo?: string | null;
}
