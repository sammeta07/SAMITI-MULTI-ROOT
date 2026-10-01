export interface ProgramOwnerCandidate {
  userId: number;
  name: string;
}

export interface ProgramOwnerPayload {
  programId: number;
  ownerUserId: number | null;
  ownerName: string | null;
  ownerAssignedBy: number | null;
  ownerAssignedAt: string | null;
}
