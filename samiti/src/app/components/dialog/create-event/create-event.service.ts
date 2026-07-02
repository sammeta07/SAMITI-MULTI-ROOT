import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CreateEventPayload, CreateEventResponse } from './create-event.models';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CreateEventService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public createEvent(payload: CreateEventPayload): Observable<CreateEventResponse> {
    const mutation = `mutation CreateEvent($input: CreateEventInput!) {
      createEvent(input: $input) {
        id
        eventId
        eventName
        committeeId
        description
        eventBanner
        status
        type
        visibility
        startDate
        endDate
        bannerImages
        createdBy
        updatedBy
        createdAt
      }
    }`;

    // Get token from localStorage and add Authorization header
    const token = localStorage.getItem('token');
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return this.http.post<{ data: { createEvent: CreateEventResponse } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          input: {
            committeeId: payload.committeeId,
            eventName: payload.eventName,
            description: payload.description || null,
            eventBanner: payload.eventBanner || null,
            bannerImageUrls: payload.bannerImageUrls || null,
            status: payload.status,
            type: payload.type || null,
            visibility: payload.visibility,
            startDate: payload.startDate,
            endDate: payload.endDate
          }
        }
      },
      { 
        withCredentials: true,
        headers
      }
    ).pipe(
      map(res => res.data.createEvent)
    );
  }
}
