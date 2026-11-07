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
          id requestType requestedAmount approvedAmount reason status
          requestedByName reviewedByName reviewNote createdAt reviewedAt
        }
        transactions {
          id requestId transactionType amount description status
          createdByName confirmedByName createdAt confirmedAt
        }
        summary {
          advanceIssued advanceSpent personalSpent returnPending returnConfirmed
          reimbursementPaid advanceBalance reimbursementDue
        }
        canRequest canApprove
      }
    }`;

    return this.request<{ taskFinance: TaskFinancePayload }>(query, { taskId })
      .pipe(map((response) => response.taskFinance));
  }

  public createRequest(taskId: number, requestType: 'ADVANCE' | 'TOP_UP', amount: string, reason: string): Observable<TaskFinanceRequest> {
    const mutation = `mutation CreateTaskFinanceRequest($input: TaskFinanceRequestInput!) {
      createTaskFinanceRequest(input: $input) {
        id requestType requestedAmount approvedAmount reason status
        requestedByName reviewedByName reviewNote createdAt reviewedAt
      }
    }`;
    return this.request<{ createTaskFinanceRequest: TaskFinanceRequest }>(mutation, {
      input: { taskId, requestType, amount: String(amount), reason }
    }).pipe(map((response) => response.createTaskFinanceRequest));
  }

  public createPersonalExpense(taskId: number, amount: string, description: string): Observable<TaskFinancePayload> {
    const mutation = `mutation CreateTaskPersonalExpense($input: TaskFinanceTransactionInput!) {
      createTaskPersonalExpense(input: $input) {
        requests {
          id requestType requestedAmount approvedAmount reason status
          requestedByName reviewedByName reviewNote createdAt reviewedAt
        }
        transactions {
          id requestId transactionType amount description status
          createdByName confirmedByName createdAt confirmedAt
        }
        summary {
          advanceIssued advanceSpent personalSpent returnPending returnConfirmed
          reimbursementPaid advanceBalance reimbursementDue
        }
        canRequest canApprove
      }
    }`;
    return this.request<{ createTaskPersonalExpense: TaskFinancePayload }>(mutation, {
      input: { taskId, transactionType: 'PERSONAL_EXPENSE', amount: String(amount), description }
    }).pipe(map((response) => response.createTaskPersonalExpense));
  }

  public reviewRequest(requestId: number, decision: 'APPROVE' | 'REJECT', approvedAmount?: string, note?: string): Observable<TaskFinanceRequest> {
    const mutation = `mutation ReviewTaskFinanceRequest($input: TaskFinanceReviewInput!) {
      reviewTaskFinanceRequest(input: $input) {
        id requestType requestedAmount approvedAmount reason status
        requestedByName reviewedByName reviewNote createdAt reviewedAt
      }
    }`;
    return this.request<{ reviewTaskFinanceRequest: TaskFinanceRequest }>(mutation, {
      input: {
        requestId,
        decision,
        ...(approvedAmount !== undefined ? { approvedAmount: String(approvedAmount) } : {}),
        note
      }
    }).pipe(map((response) => response.reviewTaskFinanceRequest));
  }

  public recordTransaction(
    taskId: number,
    transactionType: TaskFinanceTransactionType,
    amount: string,
    description: string,
    requestId?: number
  ): Observable<TaskFinanceTransaction> {
    const mutation = `mutation RecordTaskFinanceTransaction($input: TaskFinanceTransactionInput!) {
      recordTaskFinanceTransaction(input: $input) {
        id requestId transactionType amount description status
        createdByName confirmedByName createdAt confirmedAt
      }
    }`;
    return this.request<{ recordTaskFinanceTransaction: TaskFinanceTransaction }>(mutation, {
      input: { taskId, transactionType, amount: String(amount), description, requestId }
    }).pipe(map((response) => response.recordTaskFinanceTransaction));
  }

  public reviewReturn(transactionId: number, decision: 'CONFIRM' | 'REJECT', note?: string): Observable<TaskFinanceTransaction> {
    const mutation = `mutation ReviewTaskFinanceReturn($input: TaskFinanceReturnReviewInput!) {
      reviewTaskFinanceReturn(input: $input) {
        id requestId transactionType amount description status
        createdByName confirmedByName createdAt confirmedAt
      }
    }`;
    return this.request<{ reviewTaskFinanceReturn: TaskFinanceTransaction }>(mutation, {
      input: { transactionId, decision, note }
    }).pipe(map((response) => response.reviewTaskFinanceReturn));
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
