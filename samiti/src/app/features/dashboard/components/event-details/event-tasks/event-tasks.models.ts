import { TodoAssignee, TodoItem } from '../../../models/todo.models';

export interface EventTaskEntry {
  id: number;
  taskId: number;
  eventId: number;
  parentTaskId: number | null;
  taskName: string;
  status: string | null;
  ownerUserId: number | null;
  ownerName: string | null;
  todos: TodoItem[];
}

export interface EventTasksPayload {
  entries: EventTaskEntry[];
  canCreateTasks: boolean;
  canManageTodos: boolean;
  canToggleTodos: boolean;
  todoAssignees: TodoAssignee[];
}

export interface CreateEventTaskPayload {
  eventId: number;
  taskName: string;
  parentTaskId?: number | null;
}
