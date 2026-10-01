export interface ProgramOwnerCandidate {
  userId: number;
  name: string;
  email?: string | null;
  photo?: string | null;
  committeeRole?: string | null;
}

export interface ProgramOwnerPayload {
  programId: number;
  ownerUserId: number | null;
  ownerName: string | null;
  ownerAssignedBy: number | null;
  ownerAssignedAt: string | null;
}
