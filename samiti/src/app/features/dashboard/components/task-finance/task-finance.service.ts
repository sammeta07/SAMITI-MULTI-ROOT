import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import {
  TaskFinancePayload,
  TaskFinanceRequest,
  TaskFinanceTransaction,
  TaskFinanceTransactionType,
  TaskSubtaskTransfer
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
          id taskId sourceBudgetRequestId taskName taskBudgetAmount taskOwnerName taskOwnerUserId requestType approvalStage
          requestedAmount approvedAmount reason status requestedByName reviewedByName reviewNote
          authorityDecision authorityReviewedByName authorityReviewNote authorityReviewedAt
          canReviewAuthority createdAt reviewedAt
        }
        budgetRequests {
          id taskId taskName taskOwnerName requestedAmount budgetBeforeRequest requestedIncrease
          requestedByName actionByName status approvalStage creatorDecision creatorReviewedByName
          creatorReviewerDesignation creatorReviewedAt authorityDecision
          authorityReviewedByName authorityReviewerDesignation authorityReviewedAt
          createdAt canReviewCreator canReviewAuthority canCancel
        }
        transactions {
          id taskId taskName requestId transactionType amount description status
          createdByName confirmedByName createdAt confirmedAt
          recipientName receivedByName receivedAt canConfirmReceipt
        }
        subtaskTransferOptions {
          subtaskId subtaskName ownerName budgetAmount availableAmount
        }
        incomingSubtaskTransfers {
          id parentTaskId parentTaskName subtaskId subtaskName
          senderName recipientName amount description status createdAt
          confirmedByName confirmedAt canConfirmReceipt
        }
        outgoingSubtaskTransfers {
          id parentTaskId parentTaskName subtaskId subtaskName
          senderName recipientName amount description status createdAt
          confirmedByName confirmedAt canConfirmReceipt
        }
        summary {
          sanctionedBudget checklistExpenses subtaskSpent remainingBudget
          advanceIssued advanceSpent returnPending returnConfirmed advanceBalance
        }
        budgetAmount budgetRequestId requestedBudgetAmount budgetRequestStatus budgetRequestedByName
        canEditBudget canRequestBudgetIncrease canReviewBudgetRequest canCancelBudgetRequest
        canRequest canApprove isBudgetAuthority canCreateSubtaskTransfers isEventScope
      }
    }`;

    return this.request<{ taskFinance: TaskFinancePayload }>(query, { taskId })
      .pipe(map((response) => response.taskFinance));
  }

  public getEventTaskFinance(eventId: number): Observable<TaskFinancePayload> {
    const query = `query EventTaskFinance($eventId: Int!) {
      eventTaskFinance(eventId: $eventId) {
        requests {
          id taskId sourceBudgetRequestId taskName taskBudgetAmount taskOwnerName taskOwnerUserId requestType approvalStage
          requestedAmount approvedAmount reason status requestedByName reviewedByName reviewNote
          authorityDecision authorityReviewedByName authorityReviewNote authorityReviewedAt
          canReviewAuthority createdAt reviewedAt
        }
        budgetRequests {
          id taskId taskName taskOwnerName requestedAmount budgetBeforeRequest requestedIncrease
          requestedByName actionByName status approvalStage creatorDecision creatorReviewedByName
          creatorReviewerDesignation creatorReviewedAt authorityDecision
          authorityReviewedByName authorityReviewerDesignation authorityReviewedAt
          createdAt canReviewCreator canReviewAuthority canCancel
        }
        transactions {
          id taskId taskName requestId transactionType amount description status
          createdByName confirmedByName createdAt confirmedAt
          recipientName receivedByName receivedAt canConfirmReceipt
        }
        subtaskTransferOptions { subtaskId subtaskName ownerName budgetAmount availableAmount }
        incomingSubtaskTransfers {
          id parentTaskId parentTaskName subtaskId subtaskName senderName recipientName
          amount description status createdAt confirmedByName confirmedAt canConfirmReceipt
        }
        outgoingSubtaskTransfers {
          id parentTaskId parentTaskName subtaskId subtaskName senderName recipientName
          amount description status createdAt confirmedByName confirmedAt canConfirmReceipt
        }
        summary {
          sanctionedBudget checklistExpenses subtaskSpent remainingBudget
          advanceIssued advanceSpent returnPending returnConfirmed advanceBalance
        }
        budgetAmount budgetRequestId requestedBudgetAmount budgetRequestStatus budgetRequestedByName
        canEditBudget canRequestBudgetIncrease canReviewBudgetRequest canCancelBudgetRequest
        canRequest canApprove isBudgetAuthority canCreateSubtaskTransfers isEventScope
      }
    }`;
    return this.request<{ eventTaskFinance: TaskFinancePayload }>(query, { eventId })
      .pipe(map((response) => response.eventTaskFinance));
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
        id taskId sourceBudgetRequestId taskName taskBudgetAmount taskOwnerName taskOwnerUserId requestType approvalStage
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
        recipientName receivedByName receivedAt canConfirmReceipt
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
        recipientName receivedByName receivedAt canConfirmReceipt
      }
    }`;
    return this.request<{ confirmTaskFinanceReceipt: TaskFinanceTransaction }>(mutation, { transactionId })
      .pipe(map((response) => response.confirmTaskFinanceReceipt));
  }

  public createSubtaskTransfer(
    parentTaskId: number,
    subtaskId: number,
    amount: string,
    description: string
  ): Observable<TaskSubtaskTransfer> {
    const mutation = `mutation CreateSubtaskTransfer($input: CreateSubtaskTransferInput!) {
      createSubtaskTransfer(input: $input) {
        id parentTaskId parentTaskName subtaskId subtaskName
        senderName recipientName amount description status createdAt
        confirmedByName confirmedAt canConfirmReceipt
      }
    }`;
    return this.request<{ createSubtaskTransfer: TaskSubtaskTransfer }>(mutation, {
      input: { parentTaskId, subtaskId, amount: String(amount), description }
    }).pipe(map((response) => response.createSubtaskTransfer));
  }

  public confirmSubtaskTransferReceipt(transferId: number): Observable<TaskSubtaskTransfer> {
    const mutation = `mutation ConfirmSubtaskTransferReceipt($transferId: Int!) {
      confirmSubtaskTransferReceipt(transferId: $transferId) {
        id parentTaskId parentTaskName subtaskId subtaskName
        senderName recipientName amount description status createdAt
        confirmedByName confirmedAt canConfirmReceipt
      }
    }`;
    return this.request<{ confirmSubtaskTransferReceipt: TaskSubtaskTransfer }>(mutation, { transferId })
      .pipe(map((response) => response.confirmSubtaskTransferReceipt));
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
