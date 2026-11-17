export type TaskFinanceRequestType = 'ADVANCE' | 'TOP_UP' | 'REIMBURSEMENT';
export type TaskFinanceRequestStatus = 'PENDING' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED' | 'PAID';
export type TaskFinanceTransactionType =
  | 'ADVANCE_ISSUED'
  | 'ADVANCE_EXPENSE'
  | 'PERSONAL_EXPENSE'
  | 'ADVANCE_RETURN'
  | 'REIMBURSEMENT_PAID';
export type TaskFinanceTransactionStatus = 'RECORDED' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'PAID';

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
}

export interface TaskFinanceSummary {
  sanctionedBudget: string;
  checklistExpenses: string;
  budgetRemaining: string;
  advanceIssued: string;
  advanceSpent: string;
  personalSpent: string;
  returnPending: string;
  returnConfirmed: string;
  reimbursementPaid: string;
  advanceBalance: string;
  reimbursementDue: string;
}

export interface TaskFinancePayload {
  requests: TaskFinanceRequest[];
  transactions: TaskFinanceTransaction[];
  summary: TaskFinanceSummary;
  canRequest: boolean;
  canApprove: boolean;
}

export function hasPendingTreasuryAction(finance: TaskFinancePayload): boolean {
  if (!finance.canApprove) return false;
  if (finance.requests.some((request) => request.status === 'PENDING')) return true;
  if (finance.transactions.some((transaction) =>
    transaction.transactionType === 'ADVANCE_RETURN' && transaction.status === 'PENDING'
  )) return true;

  return finance.requests.some((request) => {
    if (request.status !== 'APPROVED' && request.status !== 'PARTIALLY_APPROVED') return false;

    const transactionType = request.requestType === 'REIMBURSEMENT'
      ? 'REIMBURSEMENT_PAID'
      : 'ADVANCE_ISSUED';
    const paidAmount = finance.transactions
      .filter((transaction) =>
        transaction.requestId === request.id && transaction.transactionType === transactionType
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    return Number(request.approvedAmount || 0) > paidAmount;
  });
}
