import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { EventOverviewPayload } from './event-overview/event-overview.models';

@Injectable({
  providedIn: 'root'
})
export class EventDetailsOverviewService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getEventOverview(id: string): Observable<EventOverviewPayload> {
    const query = `query {
      eventOverview(id: ${id}) {
        id
        eventId
        committeeId
        committeeAddress
        eventName
        eventDisplayName
        eventBanner
        eventLogo
        bannerImages
        status
        category
        visibility
        type
        startDate
        endDate
        latitude
        longitude
        createdBy
        updatedBy
        createdAt
        myDesignation {
          roleId
          name
          color
          icon
        }
        committeeRole
      }
    }`;

    return this.http.post<{ data: { eventOverview: EventOverviewPayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.eventOverview)
    );
  }
}
