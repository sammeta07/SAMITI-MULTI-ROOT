import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { EventDetailsPayload } from './event-details.models';

export interface DeletedEventPayload {
  eventId: number;
  eventName: string;
  deletedBy: number;
  deletedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class EventDetailsService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getEventDetails(id: string): Observable<EventDetailsPayload> {
    const query = `query {
      eventDetails(id: ${id}) {
        id
        eventId
        committeeId
        eventName
        eventDisplayName
        description
        eventBanner
        bannerImages
        status
        type
        visibility
        startDate
        endDate
        createdBy
        updatedBy
        createdAt
      }
    }`;

    return this.http.post<{ data: { eventDetails: EventDetailsPayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.eventDetails)
    );
  }

  public deleteEvent(eventId: number): Observable<DeletedEventPayload> {
    const query = `mutation DeleteEvent($eventId: Int!) {
      deleteEvent(eventId: $eventId) {
        eventId
        eventName
        deletedBy
        deletedAt
      }
    }`;

    return this.http.post<{ data: { deleteEvent: DeletedEventPayload } }>(
      this.graphqlUrl,
      {
        query,
        variables: {
          eventId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.deleteEvent)
    );
  }
}