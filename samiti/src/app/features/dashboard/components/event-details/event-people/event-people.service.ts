import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../../environments/environment';
import { EventPeoplePayload } from './event-people.models';

@Injectable({
  providedIn: 'root'
})
export class EventPeopleService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getEventPeople(eventId: string): Observable<EventPeoplePayload> {
    const query = `query {
      eventPeople(id: ${eventId}) {
        eventId
        eventParticipants {
          userId
          name
          email
          photo
          designation
          membershipStatus
        }
      }
    }`;

    return this.http.post<{ data: { eventPeople: EventPeoplePayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.eventPeople)
    );
  }
}
