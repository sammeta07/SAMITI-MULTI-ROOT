export type TaskFinanceRequestType = 'ADVANCE' | 'TOP_UP';
export type TaskFinanceRequestStatus = 'PENDING' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED';
export type TaskFinanceTransactionType =
  | 'ADVANCE_ISSUED'
  | 'ADVANCE_EXPENSE'
  | 'ADVANCE_RETURN';
export type TaskFinanceTransactionStatus = 'RECORDED' | 'PENDING' | 'CONFIRMED' | 'REJECTED';

export interface TaskFinanceRequest {
  id: number;
  requestType: TaskFinanceRequestType;
  requestedAmount: string;
  approvedAmount: string | null;
  reason: string;
  status: TaskFinanceRequestStatus;
  requestedByName: string;
  reviewedByName: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface TaskFinanceTransaction {
  id: number;
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
  transactions: TaskFinanceTransaction[];
  summary: TaskFinanceSummary;
  budgetAmount: string;
  budgetRequestId: number | null;
  requestedBudgetAmount: string | null;
  budgetRequestStatus: string | null;
  budgetRequestedByName: string | null;
  canEditBudget: boolean;
  canRequestBudgetIncrease: boolean;
  canReviewBudgetRequest: boolean;
  canCancelBudgetRequest: boolean;
  canRequest: boolean;
  canApprove: boolean;
}

export function hasPendingFinanceAction(finance: TaskFinancePayload): boolean {
  if (finance.transactions.some((transaction) => transaction.canConfirmReceipt)) return true;
  if (!finance.canApprove) return false;
  if (finance.requests.some((request) => request.status === 'PENDING')) return true;
  if (finance.transactions.some((transaction) =>
    transaction.transactionType === 'ADVANCE_RETURN' && transaction.status === 'PENDING'
  )) return true;

  return finance.requests.some((request) => {
    if (request.status !== 'APPROVED' && request.status !== 'PARTIALLY_APPROVED') return false;

    const paidAmount = finance.transactions
      .filter((transaction) =>
        transaction.requestId === request.id && transaction.transactionType === 'ADVANCE_ISSUED'
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    return Number(request.approvedAmount || 0) > paidAmount;
  });
}
