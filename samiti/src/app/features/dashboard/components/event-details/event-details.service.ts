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

export interface ExpressEventInterestPayload {
  eventId: number;
  roleId: number;
  expressed: boolean;
  myInterestRoleIds: number[];
  myInterestStatuses: Array<{ roleId: number; status: string }>;
}

export interface ReviewEventInterestPayload {
  eventId: number;
  roleId: number;
  userId: number;
  status: string;
  autoRejectedOthers?: boolean;
  previousDesignation?: string | null;
}

export interface PendingEventInterest {
  id: number;
  eventId: number;
  roleId: number;
  roleName?: string | null;
  userId: number;
  userName: string;
  userEmail: string;
  userPhoto?: string | null;
  status: string;
  createdAt?: string | null;
}

export interface EventInterestSummary {
  eventId: number;
  pending: PendingEventInterest[];
}

export interface EventVoteMember {
  userId: number;
  name: string;
  email: string;
  photo?: string | null;
  committeeRole: string;
  hasVoted: boolean;
}

export interface EventVoteHistory {
  eventId: number;
  eventName: string;
  totalMembers: number;
  votedCount: number;
  notVotedCount: number;
  members: EventVoteMember[];
}

export interface CastEventVotePayload {
  eventId: number;
  roleId: number;
  voterId: number;
  candidateId: number;
  voted: boolean;
}

export interface MyEventVote {
  roleId: number;
  candidateId: number;
  votedAt: string;
}

export interface MyEventVotesPayload {
  eventId: number;
  votes: MyEventVote[];
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
        myInterestRoleIds
        myInterestStatuses {
          roleId
          status
        }
        interestApprovedPeople {
          roleId
          approvedPeople {
            userId
            name
            email
            photo
          }
        }
        canReviewInterest
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

  public expressEventInterest(eventId: number, roleId: number): Observable<ExpressEventInterestPayload> {
    const mutation = `mutation ExpressEventInterest($eventId: Int!, $roleId: Int!) {
      expressEventInterest(eventId: $eventId, roleId: $roleId) {
        eventId
        roleId
        expressed
        myInterestRoleIds
        myInterestStatuses {
          roleId
          status
        }
      }
    }`;

    return this.http.post<{ data: { expressEventInterest: ExpressEventInterestPayload } }>(
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
      map((res) => res.data.expressEventInterest)
    );
  }

  public reviewEventInterest(eventId: number, roleId: number, userId: number, status: 'APPROVED' | 'REJECTED'): Observable<ReviewEventInterestPayload> {
    const mutation = `mutation ReviewEventInterest($eventId: Int!, $roleId: Int!, $userId: Int!, $status: String!) {
      reviewEventInterest(eventId: $eventId, roleId: $roleId, userId: $userId, status: $status) {
        eventId
        roleId
        userId
        status
      }
    }`;

    return this.http.post<{ data: { reviewEventInterest: ReviewEventInterestPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId,
          roleId,
          userId,
          status
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.reviewEventInterest)
    );
  }

  public getPendingInterests(eventId: number): Observable<EventInterestSummary> {
    const query = `query GetPendingInterests($eventId: Int!) {
      pendingEventInterests(eventId: $eventId) {
        eventId
        pending {
          id
          eventId
          roleId
          roleName
          userId
          userName
          userEmail
          userPhoto
          status
          createdAt
        }
      }
    }`;

    return this.http.post<{ data: { pendingEventInterests: EventInterestSummary } }>(
      this.graphqlUrl,
      {
        query,
        variables: {
          eventId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.pendingEventInterests)
    );
  }

  public getEventVoteHistory(eventId: number): Observable<EventVoteHistory> {
    const query = `query GetEventVoteHistory($eventId: Int!) {
      eventVoteHistory(eventId: $eventId) {
        eventId
        eventName
        totalMembers
        votedCount
        notVotedCount
        members {
          userId
          name
          email
          photo
          committeeRole
          hasVoted
        }
      }
    }`;

    return this.http.post<{ data: { eventVoteHistory: EventVoteHistory } }>(
      this.graphqlUrl,
      {
        query,
        variables: {
          eventId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.eventVoteHistory)
    );
  }

  public castEventVote(eventId: number, roleId: number, candidateId: number): Observable<CastEventVotePayload> {
    const mutation = `mutation CastEventVote($eventId: Int!, $roleId: Int!, $candidateId: Int!) {
      castEventVote(eventId: $eventId, roleId: $roleId, candidateId: $candidateId) {
        eventId
        roleId
        voterId
        candidateId
        voted
      }
    }`;

    return this.http.post<{ data: { castEventVote: CastEventVotePayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: {
          eventId,
          roleId,
          candidateId
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.castEventVote)
    );
  }

  public getMyEventVotes(eventId: number): Observable<MyEventVotesPayload> {
    const query = `query MyEventVotes($eventId: Int!) {
      myEventVotes(eventId: $eventId) {
        eventId
        votes {
          roleId
          candidateId
          votedAt
        }
      }
    }`;

    return this.http.post<{ data: { myEventVotes: MyEventVotesPayload } }>(
      this.graphqlUrl,
      { query, variables: { eventId } },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.myEventVotes)
    );
  }
}