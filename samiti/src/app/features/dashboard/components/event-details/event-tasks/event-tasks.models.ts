export interface EventTaskEntry {
  id: number;
  taskId: number;
  eventId: number;
  parentTaskId: number | null;
  taskName: string;
  status: string | null;
  ownerUserId: number | null;
  ownerName: string | null;
}

export interface EventTasksPayload {
  entries: EventTaskEntry[];
  canCreateTasks: boolean;
}

export interface CreateEventTaskPayload {
  eventId: number;
  taskName: string;
  parentTaskId?: number | null;
}
