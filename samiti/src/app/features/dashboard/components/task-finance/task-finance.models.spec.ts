import { describe, expect, it } from 'vitest';
import {
  createInitialAdvanceHistoryRequest,
  getEffectiveApprovedFinanceTotal,
  getInitialSubtaskBudgetHistoryEntry,
  getSanctionedBudgetDisplayTotal,
  getTaskAdvanceReceiptSummary,
  isCashReturnWithinAvailableCash,
  getTaskCashSummary,
  getTaskFinanceRequestRevision,
  getTopUpSourceBudgetRequestIds,
  isInitialTaskBudgetFinanceRequest,
  isVisibleInBudgetRequestLedger,
  isVisibleInPaymentHistory,
  shouldShowBudgetRequestInHistory,
  shouldShowFinanceRequestInBudgetHistory,
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
    summary: {
      sanctionedBudget: '0',
      checklistExpenses: '0',
      checklistReserved: '0',
      subtaskSpent: '0',
      remainingBudget: '0',
      advanceIssued: '0',
      advanceSpent: '0',
      returnPending: '0',
      returnConfirmed: '0',
      advanceBalance: '0',
      availableInHand: '0'
    },
    budgetAmount: '0',
    budgetRequestId: null,
    requestedBudgetAmount: null,
    budgetRequestStatus: null,
    budgetRequestedByName: null,
    canEditBudget: false,
    canReduceBudget: false,
    maxBudgetReduction: '0',
    canRequestBudgetIncrease: false,
    canReviewBudgetRequest: false,
    canCancelBudgetRequest: false,
    canRequest: false,
    canApprove: false,
    isBudgetAuthority: false,
    canViewBudgetIncreaseRequests: false,
    canViewTaskAssignee: false,
    canViewCreatedSubtaskFinance: false,
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
    isSubtask: false,
    sourceBudgetRequestId: null,
    taskName: 'Maha Bhog',
    taskBudgetAmount: '122222',
    budgetAvailableForDisbursement: '122222',
    remainingSanctionedBudget: '122222',
    checklistExpenseAmount: '1000',
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
    taskCreatedAt: '2026-11-01 10:00:00',
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
    isSubtask: false,
    taskName: 'Maha Bhog',
    taskOwnerName: 'Task owner',
    taskCreatedByName: 'Task creator',
    taskBudgetAmount: '1000',
    remainingSanctionedBudget: '122222',
    checklistExpenseAmount: '1000',
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
    taskCreatedAt: '2026-11-01 10:00:00',
    canReviewCreator: false,
    canReviewAuthority: false,
    canCancel: false,
    canDisburse: false
  };
}

function combinedDispatch(amount: string): TaskFinanceTransaction {
  return {
    id: 1,
    taskId: 43,
    isSubtask: false,
    taskName: 'Maha Bhog',
    taskOwnerName: 'Task owner',
    requestId: null,
    transactionType: 'ADVANCE_ISSUED',
    amount,
    description: 'Combined task dispatch',
    status: 'CONFIRMED',
    checklistExpenseAmount: '0',
    checklistReservedAmount: '0',
    createdByName: 'Treasurer',
    confirmedByName: 'Treasurer',
    createdAt: '2026-11-18 10:00:00',
    taskCreatedAt: '2026-11-01 10:00:00',
    confirmedAt: '2026-11-18 10:00:00',
    recipientName: 'Task owner',
    receivedByName: null,
    receivedAt: '2026-11-18 10:00:00',
    canConfirmReceipt: false,
    canConfirmReturn: false,
    canCancel: false
  };
}

function cashReturn(
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED',
  amount = '250'
): TaskFinanceTransaction {
  return {
    ...combinedDispatch(amount),
    id: 2,
    transactionType: 'ADVANCE_RETURN',
    status,
    canConfirmReturn: status === 'PENDING',
    canCancel: status === 'PENDING'
  };
}

describe('effective approved task finance total', () => {
  it('caps old finance approvals at the current sanctioned budget after a reduction', () => {
    const request = approvedRequest(1, 'ADVANCE', '2300000', {
      taskBudgetAmount: '200000'
    });

    expect(getEffectiveApprovedFinanceTotal([request])).toBe(200000);
  });

  it('keeps the approved total when it is below the current sanctioned budget', () => {
    const request = approvedRequest(1, 'ADVANCE', '150000', {
      taskBudgetAmount: '200000'
    });

    expect(getEffectiveApprovedFinanceTotal([request])).toBe(150000);
  });
});

describe('sanctioned budget ledger display', () => {
  it('shows a subtask budget while its increase request is still pending', () => {
    expect(getSanctionedBudgetDisplayTotal(true, 0, '1000')).toBe(1000);
  });

  it('keeps the approved finance total for root tasks', () => {
    expect(getSanctionedBudgetDisplayTotal(false, 4000, '5000')).toBe(4000);
  });
});

describe('initial subtask budget history', () => {
  it('creates an initial allocation entry from the first budget change baseline', () => {
    const request = {
      ...approvedBudgetRequest(1, '1000'),
      isSubtask: true,
      taskCreatedByName: 'Subtask creator',
      taskCreatedAt: '2026-11-20 09:00:00'
    };

    expect(getInitialSubtaskBudgetHistoryEntry([request])).toEqual({
      amount: 1000,
      createdAt: '2026-11-20 09:00:00',
      creatorName: 'Subtask creator'
    });
  });

  it('does not add an initial allocation entry for zero-budget subtasks', () => {
    const request = {
      ...approvedBudgetRequest(1, '0'),
      isSubtask: true
    };

    expect(getInitialSubtaskBudgetHistoryEntry([request])).toBeNull();
  });
});

describe('cash return finance history', () => {
  it('updates received and pending amounts only after recipient confirmation', () => {
    const dispatched = {
      ...combinedDispatch('100'),
      receivedAt: null
    };

    expect(getTaskAdvanceReceiptSummary(1000, 900, [dispatched])).toEqual({
      dispatchedAmount: 100,
      receivedAmount: 0,
      dispatchableAmount: 900,
      pendingReceiptAmount: 1000
    });
    expect(getTaskAdvanceReceiptSummary(1000, 900, [
      { ...dispatched, receivedAt: '2026-11-18 10:00:00' }
    ])).toEqual({
      dispatchedAmount: 100,
      receivedAmount: 100,
      dispatchableAmount: 900,
      pendingReceiptAmount: 900
    });
  });

  it('does not count a dispatched advance until the recipient confirms receipt', () => {
    const dispatched = {
      ...combinedDispatch('1000'),
      receivedAt: null,
      canConfirmReceipt: true
    };

    expect(getTaskCashSummary([dispatched])).toEqual({
      confirmedReturns: 0,
      inHand: 0,
      availableInHand: 0
    });
  });

  it('moves a subtask budget into the recipient in-hand only after receipt confirmation', () => {
    const pendingTransfer = {
      id: 1,
      parentTaskId: 7,
      subtaskId: 8,
      parentTaskName: 'Root task',
      subtaskName: 'Subtask',
      senderName: 'Root owner',
      recipientName: 'Subtask owner',
      amount: '20',
      description: 'Subtask budget transfer',
      status: 'PENDING' as const,
      createdAt: '2026-11-18 10:00:00',
      confirmedByName: null,
      confirmedAt: null,
      canConfirm: true
    };

    expect(getTaskCashSummary([combinedDispatch('100')], [pendingTransfer], 7)).toEqual({
      confirmedReturns: 0,
      inHand: 100,
      availableInHand: 100
    });
    expect(getTaskCashSummary([], [pendingTransfer], 8)).toEqual({
      confirmedReturns: 0,
      inHand: 0,
      availableInHand: 0
    });
    expect(getTaskCashSummary([combinedDispatch('100')], [
      { ...pendingTransfer, status: 'CONFIRMED', canConfirm: false }
    ], 7)).toEqual({
      confirmedReturns: 0,
      inHand: 80,
      availableInHand: 80
    });
    expect(getTaskCashSummary([], [
      { ...pendingTransfer, status: 'CONFIRMED', canConfirm: false }
    ], 8)).toEqual({
      confirmedReturns: 0,
      inHand: 20,
      availableInHand: 20
    });
  });

  it('allows returning up to available cash and rejects an excess amount', () => {
    expect(isCashReturnWithinAvailableCash('35489', 35489)).toBe(true);
    expect(isCashReturnWithinAvailableCash('35490', 35489)).toBe(false);
    expect(isCashReturnWithinAvailableCash('0', 35489)).toBe(false);
  });

  it('excludes pending and rejected returns until they are accepted', () => {
    expect(isVisibleInPaymentHistory(cashReturn('PENDING'))).toBe(false);
    expect(isVisibleInPaymentHistory(cashReturn('REJECTED'))).toBe(false);
    expect(isVisibleInPaymentHistory(cashReturn('CONFIRMED'))).toBe(true);
  });

  it('calculates cash in hand and excludes pending returns from spendable cash', () => {
    const transactions = [
      combinedDispatch('1000'),
      {
        ...combinedDispatch('200'),
        id: 3,
        transactionType: 'ADVANCE_EXPENSE' as const
      },
      cashReturn('CONFIRMED', '100'),
      cashReturn('PENDING', '300')
    ];

    expect(getTaskCashSummary(transactions)).toEqual({
      confirmedReturns: 100,
      inHand: 700,
      availableInHand: 400
    });
  });

  it('subtracts active checklist reservations from spendable in-hand cash', () => {
    const transactions = [
      {
        ...combinedDispatch('1000'),
        checklistExpenseAmount: '100',
        checklistReservedAmount: '250'
      },
      {
        ...cashReturn('PENDING', '50'),
        checklistExpenseAmount: '100',
        checklistReservedAmount: '250'
      }
    ];

    expect(getTaskCashSummary(transactions)).toEqual({
      confirmedReturns: 0,
      inHand: 900,
      availableInHand: 600
    });
  });

});

describe('budget request ledger visibility', () => {
  it('keeps a pending creator-review request visible to its reviewer', () => {
    const request = approvedBudgetRequest(1, '0');
    request.status = 'PENDING';
    request.approvalStage = 'CREATOR';
    request.canReviewCreator = true;

    expect(isVisibleInBudgetRequestLedger(request)).toBe(true);
  });

  it('hides pending requests from users who cannot review them', () => {
    const request = approvedBudgetRequest(1, '0');
    request.status = 'PENDING';
    request.approvalStage = 'CREATOR';

    expect(isVisibleInBudgetRequestLedger(request)).toBe(false);
  });
});

describe('budget request history visibility', () => {
  it('shows a pending request to its creator-stage reviewer', () => {
    const request = approvedBudgetRequest(1, '0');
    request.status = 'PENDING';
    request.approvalStage = 'CREATOR';
    request.canReviewCreator = true;

    expect(shouldShowBudgetRequestInHistory(request, new Set())).toBe(true);
  });

  it('shows a pending request to its requester but hides it from unrelated viewers', () => {
    const request = approvedBudgetRequest(1, '0');
    request.status = 'PENDING';

    expect(shouldShowBudgetRequestInHistory(request, new Set())).toBe(false);
    request.canCancel = true;
    expect(shouldShowBudgetRequestInHistory(request, new Set())).toBe(true);
  });
});

describe('task finance action indicator', () => {
  it('marks a pending budget request for its reviewer even when they are not the treasurer', () => {
    const finance: TaskFinancePayload = {
      requests: [],
      budgetRequests: [],
      transactions: [],
      summary: {
        sanctionedBudget: '0',
        checklistExpenses: '0',
        checklistReserved: '0',
        subtaskSpent: '0',
        remainingBudget: '0',
        advanceIssued: '0',
        advanceSpent: '0',
        returnPending: '0',
        returnConfirmed: '0',
        advanceBalance: '0',
        availableInHand: '0'
      },
      budgetAmount: '0',
      budgetRequestId: 1,
      requestedBudgetAmount: '1000',
      budgetRequestStatus: 'PENDING',
      budgetRequestedByName: 'Requester',
      canEditBudget: false,
      canReduceBudget: false,
      maxBudgetReduction: '0',
      canRequestBudgetIncrease: false,
      canReviewBudgetRequest: true,
      canCancelBudgetRequest: false,
      canRequest: false,
      canApprove: false,
      isBudgetAuthority: false,
      canViewTaskAssignee: false,
      canViewCreatedSubtaskFinance: false,
      isEventScope: false
    };

    expect(hasPendingFinanceAction(finance)).toBe(true);
  });

  it('marks an authority-stage advance request for its authority reviewer', () => {
    const finance: TaskFinancePayload = {
      requests: [{
        id: 1,
        taskId: 10,
        isSubtask: false,
        sourceBudgetRequestId: null,
        taskName: 'Event arrangements',
        taskBudgetAmount: '25000',
        budgetAvailableForDisbursement: '25000',
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
      summary: {
        sanctionedBudget: '0',
        checklistExpenses: '0',
        checklistReserved: '0',
        subtaskSpent: '0',
        remainingBudget: '0',
        advanceIssued: '0',
        advanceSpent: '0',
        returnPending: '0',
        returnConfirmed: '0',
        advanceBalance: '0',
        availableInHand: '0'
      },
      budgetAmount: '0',
      budgetRequestId: null,
      requestedBudgetAmount: null,
      budgetRequestStatus: null,
      budgetRequestedByName: null,
      canEditBudget: false,
      canReduceBudget: false,
      maxBudgetReduction: '0',
      canRequestBudgetIncrease: false,
      canReviewBudgetRequest: false,
      canCancelBudgetRequest: false,
      canRequest: false,
      canApprove: false,
      isBudgetAuthority: true,
      canViewTaskAssignee: false,
      canViewCreatedSubtaskFinance: false,
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
  it('identifies initial task budget requests separately from top-ups', () => {
    expect(isInitialTaskBudgetFinanceRequest(approvedRequest(20, 'ADVANCE', '0', {
      reason: 'Initial sanctioned task budget'
    }))).toBe(true);
    expect(isInitialTaskBudgetFinanceRequest(approvedRequest(21, 'TOP_UP', '1000', {
      reason: 'Initial sanctioned task budget'
    }))).toBe(false);
  });

  it('shows initial task budgets in history only after they are reviewed', () => {
    const pending = approvedRequest(20, 'ADVANCE', '0', {
      reason: 'Initial sanctioned task budget',
      status: 'PENDING',
      approvedAmount: null
    });
    const approved = { ...pending, status: 'APPROVED' as const, approvedAmount: '0' };

    expect(shouldShowFinanceRequestInBudgetHistory(pending)).toBe(false);
    expect(shouldShowFinanceRequestInBudgetHistory(approved)).toBe(true);
  });

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
