export type TodoParentType = 'TASK' | 'PROGRAM';
export type TodoStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface TodoItem {
  id: number;
  title: string;
  status: TodoStatus;
  isCompleted: boolean;
  assignedUserId: number | null;
  assignedUserName: string | null;
  createdAt: string;
}

export interface TodoAssignee {
  userId: number;
  name: string;
}
