export type TodoParentType = 'TASK' | 'PROGRAM';
export type TodoStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'PENDING';
export type EditableTodoStatus = Exclude<TodoStatus, 'PENDING'>;
export type TodoExpenseStatus = 'RESERVED' | 'CONFIRMED';

export interface TodoItem {
  id: number;
  title: string;
  expenseAmount: string;
  expenseStatus: TodoExpenseStatus;
  expenseConfirmedByName: string | null;
  expenseConfirmedAt: string | null;
  status: TodoStatus;
  isCompleted: boolean;
  createdBy: number;
  canManage: boolean;
  canUpdateStatus: boolean;
  canConfirmExpense: boolean;
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
  email?: string;
  photo?: string | null;
  committeeRole?: string;
  isWinner?: boolean;
  roleIcon?: string | null;
  roleColor?: string | null;
}
