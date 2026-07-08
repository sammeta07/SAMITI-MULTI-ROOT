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

export interface UpdateEventVotingRolesPayload {
  eventId: number;
  mappedVotingRoles: Array<{
    roleId: number;
    roleName: string;
    hindiName?: string | null;
    englishName?: string | null;
    sortOrder: number;
    nominationCount: number;
    isNominatedByCurrentUser: boolean;
    nominees: Array<{
      userId: number;
      name: string;
      email: string;
      photo?: string | null;
    }>;
  }>;
}

export interface LockEventVotingRolesPayload {
  eventId: number;
  votingRolesLocked: boolean;
}

export interface NominateEventVotingRolePayload {
  eventId: number;
  roleId: number;
  myNominatedRoleId: number;
  totalNominations: number;
  mappedVotingRoles: Array<{
    roleId: number;
    roleName: string;
    hindiName?: string | null;
    englishName?: string | null;
    sortOrder: number;
    nominationCount: number;
    isNominatedByCurrentUser: boolean;
    nominees: Array<{
      userId: number;
      name: string;
      email: string;
      photo?: string | null;
    }>;
  }>;
}

export interface WithdrawEventVotingRolePayload {
  eventId: number;
  roleId: number;
  myNominatedRoleId: number | null;
  totalNominations: number;
  mappedVotingRoles: Array<{
    roleId: number;
    roleName: string;
    hindiName?: string | null;
    englishName?: string | null;
    sortOrder: number;
    nominationCount: number;
    isNominatedByCurrentUser: boolean;
    nominees: Array<{
      userId: number;
      name: string;
      email: string;
      photo?: string | null;
    }>;
  }>;
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
        eventParticipants {
          userId
          name
          email
          photo
          designation
          membershipStatus
        }
        designationSummary {
          designation
          memberCount
        }
        eligibleVoterCount
        availableRoles {
          roleId
          roleName
          roleCode
          hindiName
          englishName
        }
        mappedVotingRoles {
          roleId
          roleName
          hindiName
          englishName
          sortOrder
          nominationCount
          isNominatedByCurrentUser
          nominees {
            userId
            name
            email
            photo
          }
        }
        canManageVotingRoles
        canSelfNominate
        currentCommitteeRole
        committeeMemberCount
        committeeAdminCount
        votingRolesLocked
        totalNominations
        myNominatedRoleId
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

  public updateEventVotingRoles(eventId: number, roleIds: number[]): Observable<UpdateEventVotingRolesPayload> {
    const mutation = `mutation UpdateEventVotingRoles($eventId: Int!, $roleIds: [Int!]!) {
      updateEventVotingRoles(eventId: $eventId, roleIds: $roleIds) {
        eventId
        mappedVotingRoles {
          roleId
          roleName
          hindiName
          englishName
          sortOrder
          nominationCount
          isNominatedByCurrentUser
          nominees {
            userId
            name
            email
            photo
          }
        }
      }
    }`;

    return this.http.post<{ data: { updateEventVotingRoles: UpdateEventVotingRolesPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId,
          roleIds
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.updateEventVotingRoles)
    );
  }

  public lockEventVotingRoles(eventId: number): Observable<LockEventVotingRolesPayload> {
    const mutation = `mutation LockEventVotingRoles($eventId: Int!) {
      lockEventVotingRoles(eventId: $eventId) {
        eventId
        votingRolesLocked
      }
    }`;

    return this.http.post<{ data: { lockEventVotingRoles: LockEventVotingRolesPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.lockEventVotingRoles)
    );
  }

  public nominateEventVotingRole(eventId: number, roleId: number): Observable<NominateEventVotingRolePayload> {
    const mutation = `mutation NominateEventVotingRole($eventId: Int!, $roleId: Int!) {
      nominateEventVotingRole(eventId: $eventId, roleId: $roleId) {
        eventId
        roleId
        myNominatedRoleId
        totalNominations
        mappedVotingRoles {
          roleId
          roleName
          hindiName
          englishName
          sortOrder
          nominationCount
          isNominatedByCurrentUser
          nominees {
            userId
            name
            email
            photo
          }
        }
      }
    }`;

    return this.http.post<{ data: { nominateEventVotingRole: NominateEventVotingRolePayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId,
          roleId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.nominateEventVotingRole)
    );
  }

  public withdrawEventVotingRole(eventId: number, roleId: number): Observable<WithdrawEventVotingRolePayload> {
    const mutation = `mutation WithdrawEventVotingRole($eventId: Int!, $roleId: Int!) {
      withdrawEventVotingRole(eventId: $eventId, roleId: $roleId) {
        eventId
        roleId
        myNominatedRoleId
        totalNominations
        mappedVotingRoles {
          roleId
          roleName
          hindiName
          englishName
          sortOrder
          nominationCount
          isNominatedByCurrentUser
          nominees {
            userId
            name
            email
            photo
          }
        }
      }
    }`;

    return this.http.post<{ data: { withdrawEventVotingRole: WithdrawEventVotingRolePayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId,
          roleId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.withdrawEventVotingRole)
    );
  }
}