export interface CreateTaskModel {
  taskId: number;
  eventId: number;
  taskName: string;
  parentTaskId: number | null;
  status?: string | null;
  ownerUserId?: number | null;
  ownerName?: string | null;
}

export interface CreateTaskRequest {
  eventId: number;
  taskName: string;
  parentTaskId?: number | null;
}