import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import {
  TaskFinancePayload,
  TaskFinanceRequest,
  TaskFinanceTransaction,
  TaskFinanceTransactionType
} from './task-finance.models';

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

@Injectable({ providedIn: 'root' })
export class TaskFinanceService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getTaskFinance(taskId: number): Observable<TaskFinancePayload> {
    const query = `query TaskFinance($taskId: Int!) {
      taskFinance(taskId: $taskId) {
        requests {
          id taskId isSubtask sourceBudgetRequestId taskName taskBudgetAmount budgetAvailableForDisbursement remainingSanctionedBudget checklistExpenseAmount taskOwnerName taskOwnerUserId requestType approvalStage
          requestedAmount approvedAmount reason status requestedByName reviewedByName reviewNote
          authorityDecision authorityReviewedByName authorityReviewNote authorityReviewedAt
          canReviewAuthority createdAt taskCreatedAt reviewedAt
        }
        budgetRequests {
          id taskId isSubtask taskName taskOwnerName remainingSanctionedBudget checklistExpenseAmount requestedAmount budgetBeforeRequest requestedIncrease
          requestedByName actionByName status approvalStage creatorDecision creatorReviewedByName
          creatorReviewerDesignation creatorReviewedAt authorityDecision
          authorityReviewedByName authorityReviewerDesignation authorityReviewedAt
          createdAt taskCreatedAt canReviewCreator canReviewAuthority canCancel
        }
        transactions {
          id taskId isSubtask taskName taskOwnerName requestId transactionType amount description status checklistExpenseAmount checklistReservedAmount
          createdByName confirmedByName createdAt taskCreatedAt confirmedAt
          recipientName receivedByName receivedAt canConfirmReceipt canConfirmReturn canCancel
        }
        summary {
          sanctionedBudget checklistExpenses checklistReserved subtaskSpent remainingBudget
          advanceIssued advanceSpent returnPending returnConfirmed advanceBalance availableInHand
        }
        budgetAmount budgetRequestId requestedBudgetAmount budgetRequestStatus budgetRequestedByName
        canEditBudget canReduceBudget maxBudgetReduction canRequestBudgetIncrease canReviewBudgetRequest canCancelBudgetRequest
        canRequest canApprove isBudgetAuthority canViewBudgetIncreaseRequests canViewTaskAssignee canViewCreatedSubtaskFinance isEventScope
      }
    }`;

    return this.request<{ taskFinance: TaskFinancePayload }>(query, { taskId })
      .pipe(map((response) => response.taskFinance));
  }

  public getEventTaskFinance(eventId: number): Observable<TaskFinancePayload> {
    const query = `query EventTaskFinance($eventId: Int!) {
      eventTaskFinance(eventId: $eventId) {
        requests {
          id taskId isSubtask sourceBudgetRequestId taskName taskBudgetAmount budgetAvailableForDisbursement remainingSanctionedBudget checklistExpenseAmount taskOwnerName taskOwnerUserId requestType approvalStage
          requestedAmount approvedAmount reason status requestedByName reviewedByName reviewNote
          authorityDecision authorityReviewedByName authorityReviewNote authorityReviewedAt
          canReviewAuthority createdAt taskCreatedAt reviewedAt
        }
        budgetRequests {
          id taskId isSubtask taskName taskOwnerName remainingSanctionedBudget checklistExpenseAmount requestedAmount budgetBeforeRequest requestedIncrease
          requestedByName actionByName status approvalStage creatorDecision creatorReviewedByName
          creatorReviewerDesignation creatorReviewedAt authorityDecision
          authorityReviewedByName authorityReviewerDesignation authorityReviewedAt
          createdAt taskCreatedAt canReviewCreator canReviewAuthority canCancel
        }
        transactions {
          id taskId isSubtask taskName taskOwnerName requestId transactionType amount description status checklistExpenseAmount checklistReservedAmount
          createdByName confirmedByName createdAt taskCreatedAt confirmedAt
          recipientName receivedByName receivedAt canConfirmReceipt canConfirmReturn canCancel
        }
        summary {
          sanctionedBudget checklistExpenses checklistReserved subtaskSpent remainingBudget
          advanceIssued advanceSpent returnPending returnConfirmed advanceBalance availableInHand
        }
        budgetAmount budgetRequestId requestedBudgetAmount budgetRequestStatus budgetRequestedByName
        canEditBudget canReduceBudget maxBudgetReduction canRequestBudgetIncrease canReviewBudgetRequest canCancelBudgetRequest
        canRequest canApprove isBudgetAuthority canViewBudgetIncreaseRequests canViewTaskAssignee canViewCreatedSubtaskFinance isEventScope
      }
    }`;
    return this.request<{ eventTaskFinance: TaskFinancePayload }>(query, { eventId })
      .pipe(map((response) => response.eventTaskFinance));
  }

  public getCreatorSubtaskFinance(eventId: number, parentTaskId: number): Observable<TaskFinancePayload> {
    const query = `query CreatorSubtaskFinance($eventId: Int!, $parentTaskId: Int!) {
      creatorSubtaskFinance(eventId: $eventId, parentTaskId: $parentTaskId) {
        requests {
          id taskId isSubtask sourceBudgetRequestId taskName taskBudgetAmount budgetAvailableForDisbursement remainingSanctionedBudget checklistExpenseAmount taskOwnerName taskOwnerUserId requestType approvalStage
          requestedAmount approvedAmount reason status requestedByName reviewedByName reviewNote
          authorityDecision authorityReviewedByName authorityReviewNote authorityReviewedAt
          canReviewAuthority createdAt taskCreatedAt reviewedAt
        }
        budgetRequests {
          id taskId isSubtask taskName taskOwnerName remainingSanctionedBudget checklistExpenseAmount requestedAmount budgetBeforeRequest requestedIncrease
          requestedByName actionByName status approvalStage creatorDecision creatorReviewedByName
          creatorReviewerDesignation creatorReviewedAt authorityDecision
          authorityReviewedByName authorityReviewerDesignation authorityReviewedAt
          createdAt taskCreatedAt canReviewCreator canReviewAuthority canCancel
        }
        transactions {
          id taskId isSubtask taskName taskOwnerName requestId transactionType amount description status checklistExpenseAmount checklistReservedAmount
          createdByName confirmedByName createdAt taskCreatedAt confirmedAt
          recipientName receivedByName receivedAt canConfirmReceipt canConfirmReturn canCancel
        }
        summary {
          sanctionedBudget checklistExpenses checklistReserved subtaskSpent remainingBudget
          advanceIssued advanceSpent returnPending returnConfirmed advanceBalance availableInHand
        }
        budgetAmount budgetRequestId requestedBudgetAmount budgetRequestStatus budgetRequestedByName
        canEditBudget canReduceBudget maxBudgetReduction canRequestBudgetIncrease canReviewBudgetRequest canCancelBudgetRequest
        canRequest canApprove isBudgetAuthority canViewBudgetIncreaseRequests canViewTaskAssignee canViewCreatedSubtaskFinance isEventScope
      }
    }`;
    return this.request<{ creatorSubtaskFinance: TaskFinancePayload }>(
      query,
      { eventId, parentTaskId }
    ).pipe(map((response) => response.creatorSubtaskFinance));
  }

  public getCreatorEventSubtaskFinance(eventId: number): Observable<TaskFinancePayload> {
    const query = `query CreatorEventSubtaskFinance($eventId: Int!) {
      creatorEventSubtaskFinance(eventId: $eventId) {
        requests {
          id taskId isSubtask sourceBudgetRequestId taskName taskBudgetAmount budgetAvailableForDisbursement remainingSanctionedBudget checklistExpenseAmount taskOwnerName taskOwnerUserId requestType approvalStage
          requestedAmount approvedAmount reason status requestedByName reviewedByName reviewNote
          authorityDecision authorityReviewedByName authorityReviewNote authorityReviewedAt
          canReviewAuthority createdAt taskCreatedAt reviewedAt
        }
        budgetRequests {
          id taskId isSubtask taskName taskOwnerName remainingSanctionedBudget checklistExpenseAmount requestedAmount budgetBeforeRequest requestedIncrease
          requestedByName actionByName status approvalStage creatorDecision creatorReviewedByName
          creatorReviewerDesignation creatorReviewedAt authorityDecision
          authorityReviewedByName authorityReviewerDesignation authorityReviewedAt
          createdAt taskCreatedAt canReviewCreator canReviewAuthority canCancel
        }
        transactions {
          id taskId isSubtask taskName taskOwnerName requestId transactionType amount description status checklistExpenseAmount checklistReservedAmount
          createdByName confirmedByName createdAt taskCreatedAt confirmedAt
          recipientName receivedByName receivedAt canConfirmReceipt canConfirmReturn canCancel
        }
        summary {
          sanctionedBudget checklistExpenses checklistReserved subtaskSpent remainingBudget
          advanceIssued advanceSpent returnPending returnConfirmed advanceBalance availableInHand
        }
        budgetAmount budgetRequestId requestedBudgetAmount budgetRequestStatus budgetRequestedByName
        canEditBudget canReduceBudget maxBudgetReduction canRequestBudgetIncrease canReviewBudgetRequest canCancelBudgetRequest
        canRequest canApprove isBudgetAuthority canViewBudgetIncreaseRequests canViewTaskAssignee canViewCreatedSubtaskFinance isEventScope
      }
    }`;
    return this.request<{ creatorEventSubtaskFinance: TaskFinancePayload }>(
      query,
      { eventId }
    ).pipe(map((response) => response.creatorEventSubtaskFinance));
  }

  public reviewBudgetRequest(requestId: number, decision: 'APPROVE' | 'REJECT'): Observable<unknown> {
    const mutation = `mutation ReviewTaskBudgetRequest($requestId: Int!, $decision: String!) {
      reviewTaskBudgetRequest(requestId: $requestId, decision: $decision) {
        requestId requestStatus
      }
    }`;
    return this.request<{ reviewTaskBudgetRequest: unknown }>(mutation, { requestId, decision })
      .pipe(map((response) => response.reviewTaskBudgetRequest));
  }

  public requestBudgetReduction(taskId: number, amount: string): Observable<unknown> {
    const mutation = `mutation RequestTaskBudgetReduction($taskId: Int!, $amount: String!) {
      requestTaskBudgetReduction(taskId: $taskId, amount: $amount) {
        requestId requestStatus requestedBudgetAmount
      }
    }`;
    return this.request<{ requestTaskBudgetReduction: unknown }>(mutation, { taskId, amount })
      .pipe(map((response) => response.requestTaskBudgetReduction));
  }

  public cancelBudgetRequest(requestId: number): Observable<unknown> {
    const mutation = `mutation CancelTaskBudgetRequest($requestId: Int!) {
      cancelTaskBudgetRequest(requestId: $requestId) {
        requestId requestStatus
      }
    }`;
    return this.request<{ cancelTaskBudgetRequest: unknown }>(mutation, { requestId })
      .pipe(map((response) => response.cancelTaskBudgetRequest));
  }

  public reviewRequest(requestId: number, decision: 'APPROVE' | 'REJECT', note?: string): Observable<TaskFinanceRequest> {
    const mutation = `mutation ReviewTaskFinanceRequest($input: TaskFinanceReviewInput!) {
      reviewTaskFinanceRequest(input: $input) {
        id taskId sourceBudgetRequestId taskName taskBudgetAmount budgetAvailableForDisbursement taskOwnerName taskOwnerUserId requestType approvalStage
        requestedAmount approvedAmount reason status requestedByName reviewedByName reviewNote
        authorityDecision authorityReviewedByName authorityReviewNote authorityReviewedAt
        canReviewAuthority createdAt reviewedAt
      }
    }`;
    return this.request<{ reviewTaskFinanceRequest: TaskFinanceRequest }>(mutation, {
      input: {
        requestId,
        decision,
        note
      }
    }).pipe(map((response) => response.reviewTaskFinanceRequest));
  }

  public recordTransaction(
    taskId: number,
    transactionType: TaskFinanceTransactionType,
    amount: string,
    description?: string,
    requestId?: number
  ): Observable<TaskFinanceTransaction> {
    const mutation = `mutation RecordTaskFinanceTransaction($input: TaskFinanceTransactionInput!) {
      recordTaskFinanceTransaction(input: $input) {
        id taskId taskName requestId transactionType amount description status
        createdByName confirmedByName createdAt confirmedAt
        recipientName receivedByName receivedAt canConfirmReceipt canConfirmReturn canCancel
      }
    }`;
    return this.request<{ recordTaskFinanceTransaction: TaskFinanceTransaction }>(mutation, {
      input: {
        taskId,
        transactionType,
        amount: String(amount),
        ...(description !== undefined ? { description } : {}),
        requestId
      }
    }).pipe(map((response) => response.recordTaskFinanceTransaction));
  }

  public confirmReceipt(transactionId: number): Observable<TaskFinanceTransaction> {
    const mutation = `mutation ConfirmTaskFinanceReceipt($transactionId: Int!) {
      confirmTaskFinanceReceipt(transactionId: $transactionId) {
        id taskId taskName requestId transactionType amount description status
        createdByName confirmedByName createdAt confirmedAt
        recipientName receivedByName receivedAt canConfirmReceipt canConfirmReturn canCancel
      }
    }`;
    return this.request<{ confirmTaskFinanceReceipt: TaskFinanceTransaction }>(mutation, { transactionId })
      .pipe(map((response) => response.confirmTaskFinanceReceipt));
  }

  public acceptCashReturn(transactionId: number): Observable<TaskFinanceTransaction> {
    const mutation = `mutation ReviewTaskFinanceReturn($input: TaskFinanceReturnReviewInput!) {
      reviewTaskFinanceReturn(input: $input) {
        id taskId taskName requestId transactionType amount description status
        createdByName confirmedByName createdAt confirmedAt
        recipientName receivedByName receivedAt canConfirmReceipt canConfirmReturn canCancel
      }
    }`;
    return this.request<{ reviewTaskFinanceReturn: TaskFinanceTransaction }>(mutation, {
      input: { transactionId, decision: 'CONFIRM' }
    }).pipe(map((response) => response.reviewTaskFinanceReturn));
  }

  public cancelCashReturn(transactionId: number): Observable<TaskFinanceTransaction> {
    const mutation = `mutation CancelTaskFinanceReturn($transactionId: Int!) {
      cancelTaskFinanceReturn(transactionId: $transactionId) {
        id taskId taskName requestId transactionType amount description status
        createdByName confirmedByName createdAt confirmedAt
        recipientName receivedByName receivedAt canConfirmReceipt canConfirmReturn canCancel
      }
    }`;
    return this.request<{ cancelTaskFinanceReturn: TaskFinanceTransaction }>(mutation, { transactionId })
      .pipe(map((response) => response.cancelTaskFinanceReturn));
  }

  private request<T>(query: string, variables: Record<string, unknown>): Observable<T> {
    return this.http.post<GraphqlResponse<T>>(
      this.graphqlUrl,
      { query, variables },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('; '));
        }
        if (!response.data) throw new Error('GraphQL response is missing data');
        return response.data;
      })
    );
  }
}