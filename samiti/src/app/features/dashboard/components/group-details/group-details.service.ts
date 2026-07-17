import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { CancelCommitteeMembershipRequestPayload, CommitteeDetailsPayload, CommitteeEventListItem, CommitteeMembershipRequestRole, CommitteeProfileMeta, DeletedEventPayload, SubmitCommitteeMembershipRequestPayload, UpdatedEventVisibilityPayload, LockEventVotingRolesPayload, UnlockEventVotingRolesPayload, StartEventNominationsPayload, StopEventNominationsPayload, AllowEventVotingPayload, StopEventVotingPayload, DeclareEventResultsPayload } from './group-details.models';
import { EventMappedVotingRole } from '../event-details/event-details.models';
import { CommitteeMembershipRequestService } from '../../../../core/services/committee-membership-request.service';
import { sanitizeCloudinaryLogoUrl } from '../../../../shared/services/cloudinary-logo.util';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

@Injectable({
  providedIn: 'root'
})
export class GroupDetailsService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;
  private readonly committeeMembershipRequestService = inject(CommitteeMembershipRequestService);

  public getCommitteeDetails(id: string): Observable<CommitteeDetailsPayload> {
    const query = `query {
      committeeDetails(id: ${id}) {
        id
        committeeId
        committeeName
        address
        establishYear
        logo
        latitude
        longitude
        contactNumbers
        createdBy
        createdAt
        committeeRole
        userRequestStatus
        userRequestRole
        members {
          id
          name
          email
          photo
          committeeRole
        }
        events {
          id
          eventId
          committeeId
          eventName
           eventDisplayName
           eventLogo
          status
          category
          type
          visibility
          startDate
          endDate
          createdBy
          updatedBy
          createdAt
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
          votingClosed
          votingEnabled
          votingPhaseState
          votingRolesLocked
        }
        availableRoles {
          roleId
          roleName
          roleCode
          hindiName
          englishName
        }
      }
    }`;

    return this.http.post<{ data: { committeeDetails: CommitteeDetailsPayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => ({
        ...res.data.committeeDetails,
        logo: sanitizeCloudinaryLogoUrl(res.data.committeeDetails?.logo)
      }))
    );
  }

  public requestCommitteeAdminRole(committeeId: number, requestRole: CommitteeMembershipRequestRole): Observable<SubmitCommitteeMembershipRequestPayload> {
    return this.committeeMembershipRequestService
      .submitCommitteeMembershipRequest(committeeId, requestRole, true)
      .pipe(map((payload) => payload as SubmitCommitteeMembershipRequestPayload));
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

  public updateEventVotingRoles(eventId: number, roleIds: number[]): Observable<{ eventId: number; mappedVotingRoles: EventMappedVotingRole[] }> {
    const query = `mutation UpdateEventVotingRoles($eventId: Int!, $roleIds: [Int!]!) {
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

    return this.http.post<{ data: { updateEventVotingRoles: { eventId: number; mappedVotingRoles: EventMappedVotingRole[] } } }>(
      this.graphqlUrl,
      {
        query,
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

  public updateEventLogo(eventId: number, committeeId: number, logo: string): Observable<{ eventId: number; eventLogo: string | null }> {
    const query = `mutation UpdateEventLogo($input: UpdateEventLogoInput!) {
      updateEventLogo(input: $input) {
        eventId
        eventLogo
      }
    }`;

    return this.http.post<{ errors?: Array<{ message: string }>; data: { updateEventLogo: { eventId: number; eventLogo: string | null } } }>(
      this.graphqlUrl,
      {
        query,
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

  public updateCommitteeLogo(committee: CommitteeProfileMeta, logo: string): Observable<CommitteeProfileMeta> {
    const query = `mutation UpdateCommitteeLogo($input: UpdateCommitteeLogoInput!) {
      updateCommitteeLogo(input: $input) {
        data {
          committeeId
          logo
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ updateCommitteeLogo: { data: { committeeId: number; logo: string | null } } }>>(
      this.graphqlUrl,
      {
        query,
        variables: {
          input: {
            committeeId: committee.committeeId,
            logo
          }
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Failed to update committee logo');
        }

        const updatedLogo = res.data?.updateCommitteeLogo?.data?.logo ?? logo;
        return {
          ...committee,
          logo: sanitizeCloudinaryLogoUrl(updatedLogo)
        } as CommitteeProfileMeta;
      })
    );
  }

  public cancelCommitteeMembershipRequest(committeeId: number): Observable<CancelCommitteeMembershipRequestPayload> {
    return this.committeeMembershipRequestService
      .cancelCommitteeMembershipRequest(committeeId, true)
      .pipe(map((payload) => payload as CancelCommitteeMembershipRequestPayload));
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

  public unlockEventVotingRoles(eventId: number): Observable<UnlockEventVotingRolesPayload> {
    const mutation = `mutation UnlockEventVotingRoles($eventId: Int!) {
      unlockEventVotingRoles(eventId: $eventId) {
        eventId
        votingRolesLocked
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
        votingEnabled
      }
    }`;

    return this.http.post<{ data: { allowEventVoting: AllowEventVotingPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId } },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.allowEventVoting)
    );
  }

  public stopEventVoting(eventId: number): Observable<StopEventVotingPayload> {
    const mutation = `mutation StopEventVoting($eventId: Int!) {
      stopEventVoting(eventId: $eventId) {
        eventId
        votingClosed
      }
    }`;

    return this.http.post<{ data: { stopEventVoting: StopEventVotingPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId } },
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
      { query: mutation, variables: { eventId } },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data.declareEventResults)
    );
  }
}