export type TaskFinanceRequestType = 'ADVANCE' | 'TOP_UP';
export type TaskFinanceRequestStatus = 'PENDING' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED';
export type TaskFinanceTransactionType =
  | 'ADVANCE_ISSUED'
  | 'ADVANCE_EXPENSE'
  | 'ADVANCE_RETURN';
export type TaskFinanceTransactionStatus = 'RECORDED' | 'PENDING' | 'CONFIRMED' | 'REJECTED';
export type TaskSubtaskTransferStatus = 'PENDING' | 'CONFIRMED';

export interface TaskFinanceRequest {
  id: number;
  taskId: number;
  sourceBudgetRequestId: number | null;
  taskName: string;
  taskBudgetAmount: string;
  budgetAvailableForDisbursement: string;
  taskOwnerName: string | null;
  taskOwnerUserId: number | null;
  requestType: TaskFinanceRequestType;
  approvalStage: string;
  requestedAmount: string;
  approvedAmount: string | null;
  reason: string;
  status: TaskFinanceRequestStatus;
  requestedByName: string;
  reviewedByName: string | null;
  reviewNote: string | null;
  authorityDecision: string | null;
  authorityReviewedByName: string | null;
  authorityReviewNote: string | null;
  authorityReviewedAt: string | null;
  canReviewAuthority: boolean;
  createdAt: string;
  reviewedAt: string | null;
}

export function getEffectiveApprovedFinanceTotal(requests: TaskFinanceRequest[]): number {
  const approvedTotal = requests
    .filter((request) => request.status === 'APPROVED' || request.status === 'PARTIALLY_APPROVED')
    .reduce(
      (sum, request) => sum + Number(request.approvedAmount ?? request.requestedAmount ?? 0),
      0
    );
  const sanctionedBudget = Number(requests[0]?.taskBudgetAmount);
  return Number.isFinite(sanctionedBudget)
    ? Math.min(approvedTotal, Math.max(0, sanctionedBudget))
    : approvedTotal;
}

export const INITIAL_TASK_BUDGET_FINANCE_REQUEST_REASON = 'Initial sanctioned task budget';

export function isInitialTaskBudgetFinanceRequest(request: TaskFinanceRequest): boolean {
  return request.requestType === 'ADVANCE' &&
    request.reason === INITIAL_TASK_BUDGET_FINANCE_REQUEST_REASON;
}

export function shouldShowFinanceRequestInBudgetHistory(request: TaskFinanceRequest): boolean {
  return !isInitialTaskBudgetFinanceRequest(request) || request.status !== 'PENDING';
}

export interface TaskBudgetRequest {
  id: number;
  taskId: number;
  taskName: string;
  taskOwnerName: string | null;
  requestedAmount: string;
  budgetBeforeRequest: string;
  requestedIncrease: string;
  requestedByName: string;
  actionByName: string | null;
  status: string;
  approvalStage: string;
  creatorDecision: string | null;
  creatorReviewedByName: string | null;
  creatorReviewerDesignation: string | null;
  creatorReviewedAt: string | null;
  authorityDecision: string | null;
  authorityReviewedByName: string | null;
  authorityReviewerDesignation: string | null;
  authorityReviewedAt: string | null;
  createdAt: string;
  canReviewCreator: boolean;
  canReviewAuthority: boolean;
  canCancel: boolean;
}

export interface TaskFinanceTransaction {
  id: number;
  taskId: number;
  taskName: string;
  requestId: number | null;
  transactionType: TaskFinanceTransactionType;
  amount: string;
  description: string;
  status: TaskFinanceTransactionStatus;
  createdByName: string;
  confirmedByName: string | null;
  createdAt: string;
  confirmedAt: string | null;
  recipientName: string | null;
  receivedByName: string | null;
  receivedAt: string | null;
  canConfirmReceipt: boolean;
  canConfirmReturn: boolean;
}

export function isVisibleInPaymentHistory(transaction: TaskFinanceTransaction): boolean {
  return transaction.transactionType !== 'ADVANCE_RETURN' || transaction.status === 'CONFIRMED';
}

export interface TaskSubtaskTransferOption {
  subtaskId: number;
  subtaskName: string;
  ownerName: string;
  budgetAmount: string;
  availableAmount: string;
}

export interface TaskSubtaskTransfer {
  id: number;
  parentTaskId: number;
  parentTaskName: string;
  subtaskId: number;
  subtaskName: string;
  senderName: string;
  recipientName: string;
  amount: string;
  description: string;
  status: TaskSubtaskTransferStatus;
  createdAt: string;
  confirmedByName: string | null;
  confirmedAt: string | null;
  canConfirmReceipt: boolean;
}

export interface TaskFinanceSummary {
  sanctionedBudget: string;
  checklistExpenses: string;
  subtaskSpent: string;
  remainingBudget: string;
  advanceIssued: string;
  advanceSpent: string;
  returnPending: string;
  returnConfirmed: string;
  advanceBalance: string;
}

export interface TaskFinancePayload {
  requests: TaskFinanceRequest[];
  budgetRequests: TaskBudgetRequest[];
  transactions: TaskFinanceTransaction[];
  subtaskTransferOptions: TaskSubtaskTransferOption[];
  incomingSubtaskTransfers: TaskSubtaskTransfer[];
  outgoingSubtaskTransfers: TaskSubtaskTransfer[];
  summary: TaskFinanceSummary;
  budgetAmount: string;
  budgetRequestId: number | null;
  requestedBudgetAmount: string | null;
  budgetRequestStatus: string | null;
  budgetRequestedByName: string | null;
  canEditBudget: boolean;
  canReduceBudget: boolean;
  maxBudgetReduction: string;
  canRequestBudgetIncrease: boolean;
  canReviewBudgetRequest: boolean;
  canCancelBudgetRequest: boolean;
  canRequest: boolean;
  canApprove: boolean;
  isBudgetAuthority: boolean;
  canViewTaskAssignee: boolean;
  canCreateSubtaskTransfers: boolean;
  isEventScope: boolean;
}

export interface TaskFinanceRequestRevision {
  previousBudget: number;
  newBudget: number;
}

export function createInitialAdvanceHistoryRequest(
  requests: TaskFinanceRequest[],
  budgetRequests: TaskBudgetRequest[]
): TaskFinanceRequest | null {
  const sourceRequest = getInitialAdvanceSourceRequest(requests, budgetRequests);
  if (!sourceRequest) return null;

  return {
    ...sourceRequest,
    id: -Math.abs(sourceRequest.id),
    sourceBudgetRequestId: null,
    requestType: 'ADVANCE',
    approvalStage: 'TREASURER',
    requestedAmount: '0',
    approvedAmount: '0',
    reason: INITIAL_TASK_BUDGET_FINANCE_REQUEST_REASON,
    status: 'APPROVED',
    canReviewAuthority: false
  };
}

function getInitialAdvanceSourceRequest(
  requests: TaskFinanceRequest[],
  budgetRequests: TaskBudgetRequest[]
): TaskFinanceRequest | null {
  if (requests.some((request) => request.requestType === 'ADVANCE')) return null;

  const topUps = [...requests]
    .filter((request) =>
      request.requestType === 'TOP_UP' &&
      (request.status === 'APPROVED' || request.status === 'PARTIALLY_APPROVED')
    )
    .sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id - right.id
    );

  for (const request of topUps) {
    const revision = getTaskFinanceRequestRevision(request, budgetRequests);
    if (revision?.previousBudget === 0 && revision.newBudget > 0) {
      return request;
    }
  }
  return null;
}

export function getTaskFinanceRequestRevision(
  request: TaskFinanceRequest,
  budgetRequests: TaskBudgetRequest[]
): TaskFinanceRequestRevision | null {
  if (request.requestType !== 'TOP_UP') return null;

  if (request.sourceBudgetRequestId !== null) {
    const budgetRequest = budgetRequests.find(
      (candidate) => candidate.id === request.sourceBudgetRequestId
    );
    if (budgetRequest) {
      const previousBudget = parseRupees(budgetRequest.budgetBeforeRequest);
      const newBudget = parseRupees(budgetRequest.requestedAmount);
      if (previousBudget !== null && newBudget !== null) {
        return { previousBudget, newBudget };
      }
    }
  }

  const directIncrease = /Sanctioned task budget increased from\s+([\d,.]+)\s+to\s+([\d,.]+)/i
    .exec(request.reason);
  if (directIncrease) {
    const previousBudget = parseRupees(directIncrease[1]);
    const newBudget = parseRupees(directIncrease[2]);
    if (previousBudget !== null && newBudget !== null) {
      return { previousBudget, newBudget };
    }
  }

  const approvedIncrease = /Approved task budget increase to\s+([\d,.]+)/i
    .exec(request.reason);
  if (approvedIncrease) {
    const newBudget = parseRupees(approvedIncrease[1]);
    const requestedIncrease = parseRupees(request.requestedAmount);
    if (newBudget !== null && requestedIncrease !== null && requestedIncrease > 0) {
      return { previousBudget: newBudget - requestedIncrease, newBudget };
    }
  }
  return null;
}

export function getTopUpSourceBudgetRequestIds(
  requests: TaskFinanceRequest[]
): Set<number> {
  const budgetRequestIds = new Set<number>();
  requests.forEach((request) => {
    if (
      request.requestType === 'TOP_UP' &&
      request.status === 'APPROVED' &&
      request.sourceBudgetRequestId !== null
    ) {
      budgetRequestIds.add(request.sourceBudgetRequestId);
    }
  });
  return budgetRequestIds;
}

function parseRupees(value: string): number | null {
  const amount = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(amount) ? amount : null;
}

export function hasPendingFinanceAction(finance: TaskFinancePayload): boolean {
  if (finance.transactions.some((transaction) => transaction.canConfirmReceipt)) return true;
  if (finance.incomingSubtaskTransfers.some((transfer) => transfer.canConfirmReceipt)) return true;
  if (finance.canReviewBudgetRequest) return true;
  if (finance.requests.some((request) =>
    request.status === 'PENDING' && request.canReviewAuthority
  )) return true;
  if (!finance.canApprove) return false;
  if (finance.transactions.some((transaction) =>
    transaction.transactionType === 'ADVANCE_RETURN' && transaction.status === 'PENDING'
  )) return true;

  const approvedByTask = new Map<number, number>();
  finance.requests.forEach((request) => {
    if (request.status !== 'APPROVED' && request.status !== 'PARTIALLY_APPROVED') return;
    const approved = Number(request.approvedAmount ?? request.requestedAmount ?? 0);
    approvedByTask.set(request.taskId, (approvedByTask.get(request.taskId) ?? 0) + approved);
  });

  const issuedByTask = new Map<number, number>();
  finance.transactions.forEach((transaction) => {
    if (transaction.transactionType !== 'ADVANCE_ISSUED') return;
    issuedByTask.set(
      transaction.taskId,
      (issuedByTask.get(transaction.taskId) ?? 0) + Number(transaction.amount)
    );
  });

  return Array.from(approvedByTask.entries()).some(([taskId, approved]) =>
    approved > (issuedByTask.get(taskId) ?? 0)
  );
}
