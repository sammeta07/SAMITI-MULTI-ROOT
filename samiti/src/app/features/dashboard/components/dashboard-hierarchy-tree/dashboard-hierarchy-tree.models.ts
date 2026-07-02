export interface TaskItem {
  taskId: number;
  taskName: string; 
  status: string;
  ownerId?: number | null;
  parentId?: number | null;
}

export interface ProgramItem {
  programId: number;
  programName: string;
  type?: string | null;
  status?: string | null;
}

export interface EventItem {
  eventId: number;
  eventName: string;
  programs: ProgramItem[]; 
  tasks: TaskItem[];
}

export interface CommitteeItem {
  committeeId: number;
  committeeName: string;
  logo?: string | null;
  events: EventItem[]; 
}

export interface CommitteeMember {
  id: number;
  name: string;
  email: string;
  isCommitteeAdmin: number;
}

export interface CommitteeDetailsPayload {
  id: number;
  committeeId: number;
  committeeName: string;
  description: string;
  address: string;
  establishYear: number;
  logo: string | null;
  contactNumbers: string[];
  createdBy: number;
  createdAt: string;
  isLoggedUserAdmin: boolean;
  members: CommitteeMember[];
}

export interface RoleNode {
  roleName: string;
  committees: CommitteeItem[];
}

export interface TreeNode {
  name: string;
  type: 'role' | 'group' | 'event' | 'program' | 'task';
  id?: number;
  children?: TreeNode[];
  status?: string;
  logo?: string | null;
}