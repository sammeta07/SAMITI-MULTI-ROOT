export type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'HOLD' | 'WONT_FIX';
export const TASK_STATUSES: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'COMPLETED', 'HOLD', 'WONT_FIX'];

export interface EventTaskEntry {
  id: number;
  taskId: number;
  eventId: number;
  parentTaskId: number | null;
  parentTaskName: string | null;
  taskName: string;
  status: string | null;
  ownerUserId: number | null;
  ownerName: string | null;
  createdByName: string | null;
  createdAt: string;
  ownerAssignedAt: string | null;
  updatedAt: string;
}

export interface EventTasksPayload {
  entries: EventTaskEntry[];
  canCreateTasks: boolean;
  taskAssignees: TaskAssignee[];
}

export interface TaskAssignee {
  userId: number;
  name: string;
  email: string;
  photo: string | null;
  committeeRole: string;
  isWinner: boolean;
  roleIcon: string | null;
  roleColor: string | null;
}

export interface CreateEventTaskPayload {
  eventId: number;
  taskName: string;
  parentTaskId?: number | null;
  status?: TaskStatus;
}
