export interface TaskItem {
  task_id: number;
  name: string;
  status: string;
}

export interface ProgramItem {
  program_id: number;
  program_name: string;
  tasks: TaskItem[];
}

export interface EventItem {
  event_id: number;
  name: string;
  programs: ProgramItem[];
}

export interface CommitteeItem {
  committee_id: number;
  committee_name: string;
  events: EventItem[];
}

export interface RoleNode {
  role_name: string;
  committees: CommitteeItem[];
}

export interface TreeNode {
  name: string;
  type: 'role' | 'group' | 'event' | 'program' | 'task';
  id?: number;
  children?: TreeNode[];
  status?: string;
}