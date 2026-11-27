export type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'HOLD' | 'WONT_FIX';
export const TASK_STATUSES: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'COMPLETED', 'HOLD', 'WONT_FIX'];

const TASK_HIERARCHY_LEVEL_BACKGROUNDS = [
  '#e2e8f0',
  '#dbeafe'
];

export function taskHierarchyLevelBackground(depth: number): string {
  const level = Math.max(0, Math.floor(depth));
  return TASK_HIERARCHY_LEVEL_BACKGROUNDS[level % TASK_HIERARCHY_LEVEL_BACKGROUNDS.length];
}

export interface EventTaskEntry {
  id: number;
  taskId: number;
  eventId: number;
  parentTaskId: number | null;
  parentTaskName: string | null;
  taskName: string;
  budgetAmount: string;
  issuedAmount?: string;
  budgetRequestId: number | null;
  requestedBudgetAmount: string | null;
  budgetRequestStatus: string | null;
  budgetRequestedByName: string | null;
  canReviewBudgetRequest: boolean;
  canCancelBudgetRequest: boolean;
  canRequestBudgetIncrease: boolean;
  status: string | null;
  ownerUserId: number | null;
  ownerName: string | null;
  assignedByName: string | null;
  createdByName: string | null;
  updatedByName?: string | null;
  createdAt: string;
  ownerAssignedAt: string | null;
  updatedAt: string;
  canManage: boolean;
  canUpdateStatus: boolean;
  canEditTask: boolean;
  canAssignOwner: boolean;
  canDelete: boolean;
  canAccessFinance?: boolean;
  isTaskCreator?: boolean;
  canViewCreatedSubtaskFinance?: boolean;
  needsFinanceAction?: boolean;
}

export interface EventTasksPayload {
  entries: EventTaskEntry[];
  canCreateTasks: boolean;
  taskAssignees: TaskAssignee[];
}

export interface TaskBudgetNode {
  taskId: number;
  parentTaskId: number | null;
  budgetAmount: string | number;
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
  budgetAmount: string;
  parentTaskId?: number | null;
  status?: TaskStatus;
}

export interface TaskBudgetUpdateResult {
  budgetAmount: string;
  status: string;
  updatedAt: string;
  requestId: number | null;
  requestStatus: string | null;
  requestedBudgetAmount: string | null;
  canRequestBudgetIncrease?: boolean;
}

export function isValidTaskBudgetAmount(value: string | number | null | undefined): boolean {
  return /^\d{1,10}$/.test(String(value ?? '').trim());
}

export function formatTaskBudgetAmount(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `₹ ${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0
  })}`;
}

export function formatIssuedAndSanctionedTaskBudget(
  issuedAmount: string | number | null | undefined,
  sanctionedAmount: string | number | null | undefined
): string {
  const formattedSanctionedAmount = formatTaskBudgetAmount(sanctionedAmount).replace(/^₹\s*/, '');
  return `${formatTaskBudgetAmount(issuedAmount)} / ${formattedSanctionedAmount}`;
}

export function calculateTaskBudgetRemaining(
  taskId: number,
  budgetAmount: string | number,
  descendants: TaskBudgetNode[]
): number {
  const toCents = (amount: string | number): number => {
    const value = Number(amount);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  };
  const children = descendants.filter((task) => task.parentTaskId === taskId);
  const allocatedCents = children
    .reduce((sum, child) => sum + toCents(child.budgetAmount), 0);
  return (toCents(budgetAmount) - allocatedCents) / 100;
}
