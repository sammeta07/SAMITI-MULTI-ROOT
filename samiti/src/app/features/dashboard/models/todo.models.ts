export type TodoParentType = 'TASK' | 'PROGRAM';
export type TodoStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface TodoItem {
  id: number;
  title: string;
  status: TodoStatus;
  isCompleted: boolean;
  assignedUserId: number | null;
  assignedUserName: string | null;
  createdByName?: string | null;
  createdAt: string;
  assignedByName?: string | null;
  assignedAt?: string | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
}

export interface TodoAssignee {
  userId: number;
  name: string;
}
