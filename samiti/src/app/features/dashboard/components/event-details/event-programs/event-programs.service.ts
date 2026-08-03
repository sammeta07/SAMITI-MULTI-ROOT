import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../../environments/environment';
import { EventProgramsPayload } from './event-programs.models';

@Injectable({
  providedIn: 'root'
})
export class EventProgramsService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getEventPrograms(eventId: string): Observable<EventProgramsPayload> {
    const query = `query {
      eventPrograms(id: ${eventId}) {
        eventId
        programs {
          id
          programId
          programName
          status
          visibility
          startDate
          endDate
          programBanner
        }
      }
    }`;

    return this.http.post<{ data: { eventPrograms: EventProgramsPayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.eventPrograms)
    );
  }
}
