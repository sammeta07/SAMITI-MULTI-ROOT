export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface TaskAssignee {
  userId: number;
  name: string;
}

export interface EventTaskEntry {
  id: number;
  taskId: number;
  eventId: number;
  parentTaskId: number | null;
  taskName: string;
  status: string | null;
  ownerUserId: number | null;
  ownerName: string | null;
  createdAt: string;
}

export interface EventTasksPayload {
  entries: EventTaskEntry[];
  canCreateTasks: boolean;
  taskAssignees: TaskAssignee[];
}

export interface CreateEventTaskPayload {
  eventId: number;
  taskName: string;
  parentTaskId?: number | null;
  status?: TaskStatus;
  ownerUserId?: number | null;
}
