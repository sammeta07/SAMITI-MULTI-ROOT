import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CreateEventPayload, CreateEventResponse, UpdateEventPayload, UpdateEventResponse } from './create-event.models';
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

  public updateEvent(payload: UpdateEventPayload): Observable<UpdateEventResponse> {
    const mutation = `mutation UpdateEvent($input: UpdateEventInput!) {
      updateEvent(input: $input) {
        id
        eventId
        eventName
        eventDisplayName
        committeeId
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

    const token = this.authService.getToken();
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return this.http.post<{ data: { updateEvent: UpdateEventResponse } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          input: {
            eventId: payload.eventId,
            committeeId: payload.committeeId,
            eventName: payload.eventName,
            eventDisplayName: payload.eventDisplayName || null,
            address: payload.address || null,
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
      map((res) => res.data.updateEvent)
    );
  }
}
