import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../../environments/environment';
import { CreateEventTaskPayload, EventTaskEntry, EventTasksPayload, TaskStatus } from './event-tasks.models';

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

@Injectable({
  providedIn: 'root'
})
export class EventTasksService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getEventTasks(eventId: string): Observable<EventTasksPayload> {
    const query = `query {
      eventTasks(id: ${eventId}) {
        entries {
          id
          taskId
          eventId
          parentTaskId
          parentTaskName
          taskName
          budgetAmount
          budgetRequestId
          requestedBudgetAmount
          budgetRequestStatus
          budgetRequestedByName
          canReviewBudgetRequest
          canRequestBudgetIncrease
          status
          ownerUserId
          ownerName
          assignedByName
          createdByName
          createdAt
          ownerAssignedAt
          updatedAt
          canManage
          canEditTask
          canAssignOwner
          canDelete
        }
        canCreateTasks
        taskAssignees {
          userId
          name
          email
          photo
          committeeRole
          isWinner
          roleIcon
          roleColor
        }
      }
    }`;

    return this.http.post<{ data: { eventTasks: EventTasksPayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.eventTasks)
    );
  }

  public createEventTask(input: CreateEventTaskPayload): Observable<EventTaskEntry> {
    const mutation = `mutation CreateEventTask($input: CreateEventTaskInput!) {
      createEventTask(input: $input) {
        id
        taskId
        eventId
        parentTaskId
        parentTaskName
        taskName
        budgetAmount
        budgetRequestId
        requestedBudgetAmount
        budgetRequestStatus
        budgetRequestedByName
        canReviewBudgetRequest
        canRequestBudgetIncrease
        status
        ownerUserId
        ownerName
        assignedByName
        createdByName
        createdAt
        ownerAssignedAt
        updatedAt
        canManage
        canEditTask
        canAssignOwner
        canDelete
      }
    }`;

    return this.http.post<GraphqlResponse<{ createEventTask: EventTaskEntry }>>(
      this.graphqlUrl,
      { query: mutation, variables: { input } },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('; '));
        }
        const createdTask = response.data?.createEventTask;
        if (!createdTask) {
          throw new Error('GraphQL response is missing createEventTask');
        }
        return createdTask;
      })
    );
  }

  public assignEventTask(taskId: number, ownerUserId: number | null): Observable<EventTaskEntry> {
    const mutation = `mutation AssignEventTask($taskId: Int!, $ownerUserId: Int) {
      assignEventTask(taskId: $taskId, ownerUserId: $ownerUserId) {
        id
        taskId
        eventId
        parentTaskId
        parentTaskName
        taskName
        status
        ownerUserId
        ownerName
        assignedByName
        createdByName
        createdAt
        ownerAssignedAt
        updatedAt
        canManage
        canEditTask
        canAssignOwner
        canDelete
      }
    }`;

    return this.http.post<{ data: { assignEventTask: EventTaskEntry } }>(
      this.graphqlUrl,
      { query: mutation, variables: { taskId, ownerUserId } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.assignEventTask)
    );
  }

  public updateEventTaskStatus(taskId: number, status: TaskStatus): Observable<EventTaskEntry> {
    const mutation = `mutation UpdateEventTaskStatus($taskId: Int!, $status: EventTaskStatus!) {
      updateEventTaskStatus(taskId: $taskId, status: $status) {
        id
        taskId
        eventId
        parentTaskId
        parentTaskName
        taskName
        status
        ownerUserId
        ownerName
        assignedByName
        createdByName
        createdAt
        ownerAssignedAt
        updatedAt
        canManage
        canEditTask
        canAssignOwner
        canDelete
      }
    }`;

    return this.http.post<GraphqlResponse<{ updateEventTaskStatus: EventTaskEntry }>>(
      this.graphqlUrl,
      { query: mutation, variables: { taskId, status } },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('; '));
        }
        const updatedTask = response.data?.updateEventTaskStatus;
        if (!updatedTask) {
          throw new Error('GraphQL response is missing updateEventTaskStatus');
        }
        return updatedTask;
      })
    );
  }

  public updateEventTaskName(taskId: number, taskName: string): Observable<{ taskName: string; updatedAt: string }> {
    const mutation = `mutation UpdateEventTaskName($taskId: Int!, $taskName: String!) {
      updateEventTaskName(taskId: $taskId, taskName: $taskName) {
        taskName
        updatedAt
      }
    }`;

    return this.http.post<GraphqlResponse<{ updateEventTaskName: { taskName: string; updatedAt: string } }>>(
      this.graphqlUrl,
      { query: mutation, variables: { taskId, taskName } },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('; '));
        }
        const updatedTask = response.data?.updateEventTaskName;
        if (!updatedTask) {
          throw new Error('GraphQL response is missing updateEventTaskName');
        }
        return updatedTask;
      })
    );
  }

  public deleteEventTask(taskId: number): Observable<boolean> {
    const mutation = `mutation DeleteEventTask($taskId: Int!) {
      deleteEventTask(taskId: $taskId)
    }`;

    return this.http.post<GraphqlResponse<{ deleteEventTask: boolean }>>(
      this.graphqlUrl,
      { query: mutation, variables: { taskId } },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('; '));
        }
        const deleted = response.data?.deleteEventTask;
        if (deleted !== true) {
          throw new Error('Task deletion was not confirmed by the server');
        }
        return deleted;
      })
    );
  }
}
