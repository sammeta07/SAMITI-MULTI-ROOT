export interface VoteHistoryMember {
  id: number;
  name: string;
  email: string;
  role: string;
  photo?: string | null;
  hasVoted: boolean;
}

export interface VoteHistoryDialogData {
  eventName: string;
  totalMembers: number;
  votedCount: number;
  notVotedCount: number;
  members: VoteHistoryMember[];
  liveTracking: boolean;
}
