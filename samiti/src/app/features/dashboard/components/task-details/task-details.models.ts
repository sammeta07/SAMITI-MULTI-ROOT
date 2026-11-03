import { TodoAssignee, TodoItem } from '../../models/todo.models';
import { TaskAssignee } from '../event-details/event-tasks/event-tasks.models';

export interface TaskChild {
  taskId: number;
  parentTaskId: number | null;
  taskName: string;
  status: string | null;
  ownerUserId: number | null;
  ownerName: string | null;
  assignedByName: string | null;
  createdByName: string | null;
  createdAt: string | null;
  ownerAssignedAt: string | null;
  canManage: boolean;
  canAssignOwner: boolean;
  canDelete: boolean;
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
  createdByName: string | null;
  createdAt: string;
  ownerAssignedAt: string | null;
  updatedAt: string;
  children: TaskChild[];
  descendants: TaskChild[];
  taskAssignees: TaskAssignee[];
  todos: TodoItem[];
  todoAssignees: TodoAssignee[];
  canManage: boolean;
  canEditTask: boolean;
  canAssignOwner: boolean;
  canDeleteTask: boolean;
  canCreateTasks: boolean;
  canManageTodos: boolean;
  canToggleTodos: boolean;
}
