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

export interface UploadEventBannerImagesPayload {
  eventId: number;
  bannerImages: string[];
}

export interface UpdatedEventVisibilityPayload {
  eventId: number;
  visibility: 'VISIBLE' | 'HIDDEN';
  updatedBy: number;
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
        committeeAddress
        eventName
        eventDisplayName
        eventBanner
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

  public uploadEventBannerImages(eventId: number, bannerImageUrls: string[]): Observable<UploadEventBannerImagesPayload> {
    const mutation = `mutation UploadEventBannerImages($eventId: Int!, $bannerImageUrls: [String!]!) {
      uploadEventBannerImages(eventId: $eventId, bannerImageUrls: $bannerImageUrls) {
        eventId
        bannerImages
      }
    }`;

    return this.http.post<{ data: { uploadEventBannerImages: UploadEventBannerImagesPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId, bannerImageUrls } },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.uploadEventBannerImages)
    );
  }

  public deleteEventBannerImage(eventId: number, mediaUrl: string): Observable<UploadEventBannerImagesPayload> {
    const mutation = `mutation DeleteEventBannerImage($eventId: Int!, $mediaUrl: String!) {
      deleteEventBannerImage(eventId: $eventId, mediaUrl: $mediaUrl) {
        eventId
        bannerImages
      }
    }`;

    return this.http.post<{ data: { deleteEventBannerImage: UploadEventBannerImagesPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId, mediaUrl } },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.deleteEventBannerImage)
    );
  }

  public updateEventVisibility(eventId: number, visibility: 'VISIBLE' | 'HIDDEN'): Observable<UpdatedEventVisibilityPayload> {
    const query = `mutation UpdateEventVisibility($eventId: Int!, $visibility: String!) {
      updateEventVisibility(eventId: $eventId, visibility: $visibility) {
        eventId
        visibility
        updatedBy
      }
    }`;

    return this.http.post<{ data: { updateEventVisibility: UpdatedEventVisibilityPayload } }>(
      this.graphqlUrl,
      {
        query,
        variables: {
          eventId,
          visibility
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.updateEventVisibility)
    );
  }
}