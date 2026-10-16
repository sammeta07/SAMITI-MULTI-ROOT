import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../../environments/environment';
import { CreateEventTaskPayload, EventTaskEntry, EventTasksPayload } from './event-tasks.models';

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
          taskName
          status
          ownerUserId
          ownerName
          todos {
            id
            title
            status
            isCompleted
            assignedUserId
            assignedUserName
            createdAt
          }
        }
        canCreateTasks
        canManageTodos
        canToggleTodos
        todoAssignees {
          userId
          name
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
        taskName
        status
        ownerUserId
        ownerName
        todos {
          id
          title
          status
          isCompleted
          assignedUserId
          assignedUserName
          createdAt
        }
      }
    }`;

    return this.http.post<{ data: { createEventTask: EventTaskEntry } }>(
      this.graphqlUrl,
      { query: mutation, variables: { input } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.createEventTask)
    );
  }
}
