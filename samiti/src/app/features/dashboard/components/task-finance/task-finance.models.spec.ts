import { describe, expect, it } from 'vitest';
import {
  createInitialAdvanceHistoryRequest,
  getTaskFinanceRequestRevision,
  getTopUpSourceBudgetRequestIds,
  TaskBudgetRequest,
  TaskFinancePayload,
  TaskFinanceRequest,
  TaskFinanceTransaction,
  hasPendingFinanceAction
} from './task-finance.models';

function emptyFinancePayload(overrides: Partial<TaskFinancePayload> = {}): TaskFinancePayload {
  return {
    requests: [],
    budgetRequests: [],
    transactions: [],
    subtaskTransferOptions: [],
    incomingSubtaskTransfers: [],
    outgoingSubtaskTransfers: [],
    summary: {
      sanctionedBudget: '0',
      checklistExpenses: '0',
      subtaskSpent: '0',
      remainingBudget: '0',
      advanceIssued: '0',
      advanceSpent: '0',
      returnPending: '0',
      returnConfirmed: '0',
      advanceBalance: '0'
    },
    budgetAmount: '0',
    budgetRequestId: null,
    requestedBudgetAmount: null,
    budgetRequestStatus: null,
    budgetRequestedByName: null,
    canEditBudget: false,
    canRequestBudgetIncrease: false,
    canReviewBudgetRequest: false,
    canCancelBudgetRequest: false,
    canRequest: false,
    canApprove: false,
    isBudgetAuthority: false,
    canCreateSubtaskTransfers: false,
    isEventScope: false,
    ...overrides
  };
}

function approvedRequest(
  id: number,
  requestType: 'ADVANCE' | 'TOP_UP',
  amount: string,
  overrides: Partial<TaskFinanceRequest> = {}
): TaskFinanceRequest {
  return {
    id,
    taskId: 43,
    sourceBudgetRequestId: null,
    taskName: 'Maha Bhog',
    taskBudgetAmount: '122222',
    taskOwnerName: 'Task owner',
    taskOwnerUserId: 7,
    requestType,
    approvalStage: 'TREASURER',
    requestedAmount: amount,
    approvedAmount: amount,
    reason: '',
    status: 'APPROVED',
    requestedByName: 'Requester',
    reviewedByName: null,
    reviewNote: null,
    authorityDecision: 'APPROVED',
    authorityReviewedByName: 'Authority',
    authorityReviewNote: null,
    authorityReviewedAt: null,
    canReviewAuthority: false,
    createdAt: '2026-11-17 10:00:00',
    reviewedAt: null,
    ...overrides
  };
}

function approvedBudgetRequest(
  id: number,
  budgetBeforeRequest: string
): TaskBudgetRequest {
  return {
    id,
    taskId: 43,
    taskName: 'Maha Bhog',
    taskOwnerName: 'Task owner',
    requestedAmount: '1000',
    budgetBeforeRequest,
    requestedIncrease: '1000',
    requestedByName: 'Requester',
    actionByName: 'Authority',
    status: 'APPROVED',
    approvalStage: 'AUTHORITY',
    creatorDecision: 'APPROVED',
    creatorReviewedByName: 'Creator',
    creatorReviewerDesignation: null,
    creatorReviewedAt: null,
    authorityDecision: 'APPROVED',
    authorityReviewedByName: 'Authority',
    authorityReviewerDesignation: null,
    authorityReviewedAt: null,
    createdAt: '2026-11-17 10:00:00',
    canReviewCreator: false,
    canReviewAuthority: false,
    canCancel: false
  };
}

function combinedDispatch(amount: string): TaskFinanceTransaction {
  return {
    id: 1,
    taskId: 43,
    taskName: 'Maha Bhog',
    requestId: null,
    transactionType: 'ADVANCE_ISSUED',
    amount,
    description: 'Combined task dispatch',
    status: 'CONFIRMED',
    createdByName: 'Treasurer',
    confirmedByName: 'Treasurer',
    createdAt: '2026-11-18 10:00:00',
    confirmedAt: '2026-11-18 10:00:00',
    recipientName: 'Task owner',
    receivedByName: null,
    receivedAt: null,
    canConfirmReceipt: false
  };
}

describe('task finance action indicator', () => {
  it('marks a pending budget request for its reviewer even when they are not the treasurer', () => {
    const finance: TaskFinancePayload = {
      requests: [],
      budgetRequests: [],
      transactions: [],
      subtaskTransferOptions: [],
      incomingSubtaskTransfers: [],
      outgoingSubtaskTransfers: [],
      summary: {
        sanctionedBudget: '0',
        checklistExpenses: '0',
        subtaskSpent: '0',
        remainingBudget: '0',
        advanceIssued: '0',
        advanceSpent: '0',
        returnPending: '0',
        returnConfirmed: '0',
        advanceBalance: '0'
      },
      budgetAmount: '0',
      budgetRequestId: 1,
      requestedBudgetAmount: '1000',
      budgetRequestStatus: 'PENDING',
      budgetRequestedByName: 'Requester',
      canEditBudget: false,
      canRequestBudgetIncrease: false,
      canReviewBudgetRequest: true,
      canCancelBudgetRequest: false,
      canRequest: false,
      canApprove: false,
      isBudgetAuthority: false,
      canCreateSubtaskTransfers: false,
      isEventScope: false
    };

    expect(hasPendingFinanceAction(finance)).toBe(true);
  });

  it('marks an authority-stage advance request for its authority reviewer', () => {
    const finance: TaskFinancePayload = {
      requests: [{
        id: 1,
        taskId: 10,
        sourceBudgetRequestId: null,
        taskName: 'Event arrangements',
        taskBudgetAmount: '25000',
        taskOwnerName: 'Task owner',
        taskOwnerUserId: 7,
        requestType: 'ADVANCE',
        approvalStage: 'AUTHORITY',
        requestedAmount: '10000',
        approvedAmount: null,
        reason: 'Venue booking',
        status: 'PENDING',
        requestedByName: 'Task owner',
        reviewedByName: null,
        reviewNote: null,
        authorityDecision: null,
        authorityReviewedByName: null,
        authorityReviewNote: null,
        authorityReviewedAt: null,
        canReviewAuthority: true,
        createdAt: '2026-11-17 10:00:00',
        reviewedAt: null
      }],
      budgetRequests: [],
      transactions: [],
      subtaskTransferOptions: [],
      incomingSubtaskTransfers: [],
      outgoingSubtaskTransfers: [],
      summary: {
        sanctionedBudget: '0',
        checklistExpenses: '0',
        subtaskSpent: '0',
        remainingBudget: '0',
        advanceIssued: '0',
        advanceSpent: '0',
        returnPending: '0',
        returnConfirmed: '0',
        advanceBalance: '0'
      },
      budgetAmount: '0',
      budgetRequestId: null,
      requestedBudgetAmount: null,
      budgetRequestStatus: null,
      budgetRequestedByName: null,
      canEditBudget: false,
      canRequestBudgetIncrease: false,
      canReviewBudgetRequest: false,
      canCancelBudgetRequest: false,
      canRequest: false,
      canApprove: false,
      isBudgetAuthority: true,
      canCreateSubtaskTransfers: false,
      isEventScope: false
    };

    expect(hasPendingFinanceAction(finance)).toBe(true);
  });

  it('marks a pending subtask transfer for its recipient', () => {
    const finance: TaskFinancePayload = {
      requests: [],
      budgetRequests: [],
      transactions: [],
      subtaskTransferOptions: [],
      incomingSubtaskTransfers: [{
        id: 1,
        parentTaskId: 10,
        parentTaskName: 'Parent task',
        subtaskId: 11,
        subtaskName: 'Subtask',
        senderName: 'Parent owner',
        recipientName: 'Subtask owner',
        amount: '500',
        description: 'Materials',
        status: 'PENDING',
        createdAt: '2026-11-17 10:00:00',
        confirmedByName: null,
        confirmedAt: null,
        canConfirmReceipt: true
      }],
      outgoingSubtaskTransfers: [],
      summary: {
        sanctionedBudget: '0',
        checklistExpenses: '0',
        subtaskSpent: '0',
        remainingBudget: '0',
        advanceIssued: '0',
        advanceSpent: '0',
        returnPending: '0',
        returnConfirmed: '0',
        advanceBalance: '0'
      },
      budgetAmount: '0',
      budgetRequestId: null,
      requestedBudgetAmount: null,
      budgetRequestStatus: null,
      budgetRequestedByName: null,
      canEditBudget: false,
      canRequestBudgetIncrease: false,
      canReviewBudgetRequest: false,
      canCancelBudgetRequest: false,
      canRequest: false,
      canApprove: false,
      isBudgetAuthority: false,
      canCreateSubtaskTransfers: false,
      isEventScope: false
    };

    expect(hasPendingFinanceAction(finance)).toBe(true);
  });

  it('counts one task-level dispatch against the combined approved advance and top-up amounts', () => {
    const finance = emptyFinancePayload({
      canApprove: true,
      requests: [
        approvedRequest(19, 'TOP_UP', '22222'),
        approvedRequest(16, 'ADVANCE', '100000')
      ],
      transactions: [combinedDispatch('122222')]
    });

    expect(hasPendingFinanceAction(finance)).toBe(false);

    finance.transactions = [combinedDispatch('120000')];
    expect(hasPendingFinanceAction(finance)).toBe(true);
  });
});

describe('initial advance history fallback', () => {
  it('creates a zero-value advance row from the earliest approved zero-base increase', () => {
    const first = approvedRequest(21, 'TOP_UP', '1000', {
      reason: 'Sanctioned task budget increased from 0 to 1000',
      requestedByName: 'Initial requester',
      reviewedByName: 'Initial reviewer',
      reviewedAt: '2026-11-17 12:00:00',
      createdAt: '2026-11-17 10:00:00'
    });
    const later = approvedRequest(22, 'TOP_UP', '1501', {
      reason: 'Sanctioned task budget increased from 0 to 1501',
      createdAt: '2026-11-18 10:00:00'
    });
    const advance = createInitialAdvanceHistoryRequest([later, first], []);

    expect(advance).toMatchObject({
      id: -first.id,
      requestType: 'ADVANCE',
      requestedAmount: '0',
      approvedAmount: '0',
      requestedByName: first.requestedByName,
      createdAt: first.createdAt,
      reviewedByName: first.reviewedByName,
      reviewedAt: first.reviewedAt
    });
  });

  it('uses linked budget history and does not infer a duplicate when an advance exists', () => {
    const linkedTopUp = approvedRequest(23, 'TOP_UP', '1000', {
      sourceBudgetRequestId: 9,
      reason: 'Approved task budget increase to 1000'
    });
    const advance = approvedRequest(24, 'ADVANCE', '2500');

    expect(createInitialAdvanceHistoryRequest(
      [linkedTopUp],
      [approvedBudgetRequest(9, '0')]
    )).toMatchObject({
      requestType: 'ADVANCE',
      requestedAmount: '0',
      approvedAmount: '0'
    });
    expect(createInitialAdvanceHistoryRequest(
      [linkedTopUp, advance],
      [approvedBudgetRequest(9, '0')]
    )).toBeNull();
  });

  it('uses the direct sanctioned-budget update range for a Top Up revision', () => {
    const request = approvedRequest(25, 'TOP_UP', '1501', {
      reason: 'Sanctioned task budget increased from 1999 to 3500'
    });

    expect(getTaskFinanceRequestRevision(request, [])).toEqual({
      previousBudget: 1999,
      newBudget: 3500
    });
  });

  it('identifies approved budget requests already represented by a Top Up row', () => {
    const linkedTopUp = approvedRequest(26, 'TOP_UP', '999', {
      sourceBudgetRequestId: 8
    });
    const pendingTopUp = approvedRequest(27, 'TOP_UP', '1500', {
      sourceBudgetRequestId: 9,
      status: 'PENDING'
    });
    const directTopUp = approvedRequest(28, 'TOP_UP', '500');

    expect([...getTopUpSourceBudgetRequestIds([linkedTopUp, pendingTopUp, directTopUp])])
      .toEqual([8]);
  });
});
