import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { 
  CancelCommitteeMembershipRequestPayload, 
  CommitteeDetailsPayload, 
  CommitteeMembershipRequestRole, 
  CommitteeProfileMeta, 
  DeletedEventPayload, 
  SubmitCommitteeMembershipRequestPayload
} from './group-details.models';
import { EventMappedVotingRole } from '../event-details/event-voting/event-voting.models';
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

  public getCommitteeDetails(id: string, year?: number | null): Observable<CommitteeDetailsPayload> {
    const query = `query GetCommitteeDetails($year: Int) {
      committeeDetails(id: ${id}, year: $year) {
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
            color
            icon
            sortOrder
            winnerUserId
            winnerName
            winnerPhoto
            winnerVoteCount
            winnerWonBy
          }
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ committeeDetails: CommitteeDetailsPayload }>>(
      this.graphqlUrl,
      { query, variables: { year: year ?? null } },
      { withCredentials: true }
    ).pipe(
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Failed to fetch committee details.');
        }
        if (!res.data?.committeeDetails) {
          throw new Error('Committee details response is empty.');
        }

        const details = res.data.committeeDetails;
        return {
          ...details,
          logo: sanitizeCloudinaryLogoUrl(details.logo),
          events: (details.events || []).map((event) => ({
            ...event,
            eventLogo: sanitizeCloudinaryLogoUrl(event.eventLogo)
          }))
        };
      })
    );
  }

  public requestCommitteeAdminRole(
    committeeId: number, 
    requestRole: CommitteeMembershipRequestRole
  ): Observable<SubmitCommitteeMembershipRequestPayload> {
    return this.committeeMembershipRequestService
      .submitCommitteeMembershipRequest(committeeId, requestRole, true)
      .pipe(map((payload) => payload as SubmitCommitteeMembershipRequestPayload));
  }

  public cancelCommitteeMembershipRequest(committeeId: number): Observable<CancelCommitteeMembershipRequestPayload> {
    return this.committeeMembershipRequestService
      .cancelCommitteeMembershipRequest(committeeId, true)
      .pipe(map((payload) => payload as CancelCommitteeMembershipRequestPayload));
  }

  public updateEventVotingRoles(
    eventId: number, 
    roleIds: number[]
  ): Observable<{ eventId: number; mappedVotingRoles: EventMappedVotingRole[] }> {
    const query = `mutation UpdateEventVotingRoles($eventId: Int!, $roleIds: [Int!]!) {
      updateEventVotingRoles(eventId: $eventId, roleIds: $roleIds) {
        eventId
        mappedVotingRoles {
          roleId
          roleName
          hindiName
          englishName
          color
          icon
          sortOrder
          winnerUserId
          winnerName
          winnerPhoto
          winnerVoteCount
          winnerWonBy
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ updateEventVotingRoles: { eventId: number; mappedVotingRoles: EventMappedVotingRole[] } }>>(
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
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Failed to update event voting roles.');
        }
        return res.data!.updateEventVotingRoles;
      })
    );
  }

  public updateEventLogo(
    eventId: number, 
    committeeId: number, 
    logo: string
  ): Observable<{ eventId: number; eventLogo: string | null }> {
    const query = `mutation UpdateEventLogo($input: UpdateEventLogoInput!) {
      updateEventLogo(input: $input) {
        eventId
        eventLogo
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ updateEventLogo: { eventId: number; eventLogo: string | null } }>>(
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
          throw new Error(res.errors[0].message || 'Failed to update event logo.');
        }
        const data = res.data!.updateEventLogo;
        return {
          ...data,
          eventLogo: sanitizeCloudinaryLogoUrl(data.eventLogo)
        };
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

    return this.http.post<GraphQLResponseEnvelope<{ deleteEvent: DeletedEventPayload }>>(
      this.graphqlUrl,
      {
        query,
        variables: { eventId }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Failed to delete event.');
        }
        return res.data!.deleteEvent;
      })
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
          throw new Error(res.errors[0].message || 'Failed to update committee logo.');
        }

        const updatedLogo = res.data?.updateCommitteeLogo?.data?.logo ?? logo;
        return {
          ...committee,
          logo: sanitizeCloudinaryLogoUrl(updatedLogo)
        } as CommitteeProfileMeta;
      })
    );
  }
}