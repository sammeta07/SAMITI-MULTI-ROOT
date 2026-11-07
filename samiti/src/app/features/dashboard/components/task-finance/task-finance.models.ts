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
