import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CreateEventPayload, CreateEventResponse } from './create-event.models';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

@Injectable({ providedIn: 'root' })
export class CreateEventService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly graphqlUrl = environment.graphqlUrl;

  public createEvent(payload: CreateEventPayload): Observable<CreateEventResponse> {
    const mutation = `mutation CreateEvent($input: CreateEventInput!) {
      createEvent(input: $input) {
        id
        eventId
        eventName
        eventDisplayName
        committeeId
        description
        address
        eventBanner
        status
        category
        visibility
        type
        startDate
        endDate
        latitude
        longitude
        bannerImages
        createdBy
        updatedBy
        createdAt
      }
    }`;

    // Read token from centralized auth service.
    const token = this.authService.getToken();
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
            eventDisplayName: payload.eventDisplayName || null,
            description: payload.description || null,
            address: payload.address || null,
            eventBanner: payload.eventBanner || null,
            bannerImageUrls: payload.bannerImageUrls || null,
            status: payload.status,
            category: payload.category || null,
            visibility: payload.visibility,
            type: payload.type,
            startDate: payload.startDate,
            endDate: payload.endDate,
            latitude: payload.latitude,
            longitude: payload.longitude
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
