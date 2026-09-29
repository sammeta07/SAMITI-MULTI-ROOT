import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../../environments/environment';
import { EventOverviewPayload } from './event-overview.models';

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

export interface UpdatedEventLogoPayload {
  eventId: number;
  eventLogo: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class EventOverviewService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getEventOverview(id: string): Observable<EventOverviewPayload> {
    const query = `query {
      eventOverview(id: ${id}) {
        id
        eventId
        eventName
        eventDisplayName
        bannerImages
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
        variables: { eventId }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.deleteEvent)
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
      map(res => res.data.uploadEventBannerImages)
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
      map(res => res.data.deleteEventBannerImage)
    );
  }

  public updateEventLogo(eventId: number, committeeId: number, logo: string): Observable<UpdatedEventLogoPayload> {
    const mutation = `mutation UpdateEventLogo($input: UpdateEventLogoInput!) {
      updateEventLogo(input: $input) {
        eventId
        eventLogo
      }
    }`;

    return this.http.post<{ errors?: Array<{ message: string }>; data: { updateEventLogo: UpdatedEventLogoPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          input: {
            eventId,
            committeeId,
            eventLogo: logo
          }
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Failed to update event logo');
        }
        return res.data.updateEventLogo;
      })
    );
  }
}
