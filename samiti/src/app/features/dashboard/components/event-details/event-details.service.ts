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

export interface ToggleEventVotingRolePayload {
  eventId: number;
  roleId: number;
  enabled: boolean;
  mappedVotingRoles: Array<{
    roleId: number;
    roleName: string;
    hindiName?: string | null;
    englishName?: string | null;
    sortOrder: number;
  }>;
}

export interface LockEventVotingRolesPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface UnlockEventVotingRolesPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface StartEventNominationsPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface StopEventNominationsPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface AllowEventVotingPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface StopEventVotingPayload {
  eventId: number;
  votingPhaseState: number;
}

export interface DeclareEventResultsPayload {
  eventId: number;
  votingPhaseState: number;
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
        }
        canManageVotingRoles
        currentCommitteeRole
        committeeMemberCount
        committeeAdminCount
        votingPhaseState
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

  public toggleEventVotingRole(eventId: number, roleId: number, enabled: boolean): Observable<ToggleEventVotingRolePayload> {
    const mutation = `mutation ToggleEventVotingRole($eventId: Int!, $roleId: Int!, $enabled: Boolean!) {
      toggleEventVotingRole(eventId: $eventId, roleId: $roleId, enabled: $enabled) {
        eventId
        roleId
        enabled
        mappedVotingRoles {
          roleId
          roleName
          hindiName
          englishName
          sortOrder
        }
      }
    }`;

    return this.http.post<{ data: { toggleEventVotingRole: ToggleEventVotingRolePayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId,
          roleId,
          enabled
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.toggleEventVotingRole)
    );
  }

  public lockEventVotingRoles(eventId: number): Observable<LockEventVotingRolesPayload> {
    const mutation = `mutation LockEventVotingRoles($eventId: Int!) {
      lockEventVotingRoles(eventId: $eventId) {
        eventId
        votingPhaseState
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

  public unlockEventVotingRoles(eventId: number): Observable<UnlockEventVotingRolesPayload> {
    const mutation = `mutation UnlockEventVotingRoles($eventId: Int!) {
      unlockEventVotingRoles(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { unlockEventVotingRoles: UnlockEventVotingRolesPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.unlockEventVotingRoles)
    );
  }

  public startEventNominations(eventId: number): Observable<StartEventNominationsPayload> {
    const mutation = `mutation StartEventNominations($eventId: Int!) {
      startEventNominations(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { startEventNominations: StartEventNominationsPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId } },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.startEventNominations)
    );
  }

  public stopEventNominations(eventId: number): Observable<StopEventNominationsPayload> {
    const mutation = `mutation StopEventNominations($eventId: Int!) {
      stopEventNominations(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { stopEventNominations: StopEventNominationsPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId } },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.stopEventNominations)
    );
  }

  public allowEventVoting(eventId: number): Observable<AllowEventVotingPayload> {
    const mutation = `mutation AllowEventVoting($eventId: Int!) {
      allowEventVoting(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { allowEventVoting: AllowEventVotingPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.allowEventVoting)
    );
  }

  public stopEventVoting(eventId: number): Observable<StopEventVotingPayload> {
    const mutation = `mutation StopEventVoting($eventId: Int!) {
      stopEventVoting(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { stopEventVoting: StopEventVotingPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.stopEventVoting)
    );
  }

  public declareEventResults(eventId: number): Observable<DeclareEventResultsPayload> {
    const mutation = `mutation DeclareEventResults($eventId: Int!) {
      declareEventResults(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { declareEventResults: DeclareEventResultsPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.declareEventResults)
    );
  }
}