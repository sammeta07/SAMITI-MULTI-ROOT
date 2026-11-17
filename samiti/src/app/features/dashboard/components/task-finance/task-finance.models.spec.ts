import { describe, expect, it } from 'vitest';
import { TaskFinancePayload, hasPendingFinanceAction } from './task-finance.models';

describe('task finance action indicator', () => {
  it('marks a pending budget request for its reviewer even when they are not the treasurer', () => {
    const finance: TaskFinancePayload = {
      requests: [],
      transactions: [],
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
      canApprove: false
    };

    expect(hasPendingFinanceAction(finance)).toBe(true);
  });
});
