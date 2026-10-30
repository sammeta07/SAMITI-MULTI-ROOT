import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { TaskStatus } from '../event-details/event-tasks/event-tasks.models';
import { TaskDetailsPayload } from './task-details.models';

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

@Injectable({
  providedIn: 'root'
})
export class TaskDetailsService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getTaskDetails(id: string): Observable<TaskDetailsPayload> {
    const query = `query TaskDetails($id: Int!) {
      taskDetails(id: $id) {
        taskId
        taskName
        status
        eventId
        eventName
        parentTaskId
        parentTaskName
        ownerUserId
        ownerName
        createdByName
        createdAt
        ownerAssignedAt
        updatedAt
        children {
          taskId
          taskName
          status
        }
        todos {
          id
          title
          status
          isCompleted
          assignedUserId
          assignedUserName
          createdAt
        }
        todoAssignees {
          userId
          name
        }
        canCreateTasks
        canManageTodos
        canToggleTodos
      }
    }`;

    return this.http.post<GraphqlResponse<{ taskDetails: TaskDetailsPayload }>>(
      this.graphqlUrl,
      { query, variables: { id: Number(id) } },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('; '));
        }
        const details = response.data?.taskDetails;
        if (!details) {
          throw new Error('GraphQL response is missing taskDetails');
        }
        return details;
      })
    );
  }

  public updateTaskStatus(
    taskId: number,
    status: TaskStatus
  ): Observable<Pick<TaskDetailsPayload, 'taskId' | 'status' | 'updatedAt'>> {
    const mutation = `mutation UpdateEventTaskStatus($taskId: Int!, $status: EventTaskStatus!) {
      updateEventTaskStatus(taskId: $taskId, status: $status) {
        taskId
        status
        updatedAt
      }
    }`;

    return this.http.post<GraphqlResponse<{
      updateEventTaskStatus: Pick<TaskDetailsPayload, 'taskId' | 'status' | 'updatedAt'>;
    }>>(
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

  public updateTaskName(
    taskId: number,
    taskName: string
  ): Observable<Pick<TaskDetailsPayload, 'taskName' | 'updatedAt'>> {
    const mutation = `mutation UpdateEventTaskName($taskId: Int!, $taskName: String!) {
      updateEventTaskName(taskId: $taskId, taskName: $taskName) {
        taskName
        updatedAt
      }
    }`;

    return this.http.post<GraphqlResponse<{
      updateEventTaskName: Pick<TaskDetailsPayload, 'taskName' | 'updatedAt'>;
    }>>(
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

  public deleteTask(taskId: number): Observable<boolean> {
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
