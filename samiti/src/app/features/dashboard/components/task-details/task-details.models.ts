import { TodoAssignee, TodoItem } from '../../models/todo.models';

export interface TaskChild {
  taskId: number;
  taskName: string;
  status: string | null;
}

export interface TaskDetailsPayload {
  taskId: number;
  taskName: string;
  status: string | null;
  eventId: number;
  eventName: string;
  parentTaskId: number | null;
  parentTaskName: string | null;
  ownerUserId: number | null;
  ownerName: string | null;
  createdAt: string;
  children: TaskChild[];
  todos: TodoItem[];
  todoAssignees: TodoAssignee[];
  canCreateTasks: boolean;
  canManageTodos: boolean;
  canToggleTodos: boolean;
}
