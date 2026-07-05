import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { CancelCommitteeMembershipRequestPayload, CommitteeDetailsPayload, CommitteeEventListItem, CommitteeMembershipRequestRole, DeletedEventPayload, SubmitCommitteeMembershipRequestPayload, UpdatedEventVisibilityPayload } from './group-details.models';
import { CommitteeMembershipRequestService } from '../../../../core/services/committee-membership-request.service';

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
        description
        address
        establishYear
        logo
        contactNumbers
        createdBy
        createdAt
        isLoggedUserAdmin
        loggedInUserAdminStatus
        loggedInUserAdminStatusActionBy
        loggedInUserAdminStatusActionAt
        members {
          id
          name
          email
          isCommitteeAdmin
        }
      }
    }`;

    return this.http.post<{ data: { committeeDetails: CommitteeDetailsPayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.committeeDetails)
    );
  }

  public requestCommitteeAdminRole(committeeId: number, requestRole: CommitteeMembershipRequestRole): Observable<SubmitCommitteeMembershipRequestPayload> {
    return this.committeeMembershipRequestService
      .submitCommitteeMembershipRequest(committeeId, requestRole, true)
      .pipe(map((payload) => payload as SubmitCommitteeMembershipRequestPayload));
  }

  public getEventsByCommittee(committeeId: number, status?: string, visibility?: string): Observable<CommitteeEventListItem[]> {
    const query = `query EventsByCommittee($committeeId: Int!, $status: String, $visibility: String) {
      eventsByCommittee(committeeId: $committeeId, status: $status, visibility: $visibility) {
        id
        eventId
        committeeId
        eventName
        eventDisplayName
        description
        eventBanner
        status
        type
        visibility
        startDate
        endDate
        createdBy
        updatedBy
        createdAt
      }
    }`;

    return this.http.post<{ data: { eventsByCommittee: CommitteeEventListItem[] } }>(
      this.graphqlUrl,
      {
        query,
        variables: {
          committeeId,
          status: status || null,
          visibility: visibility || null
        }
      },
      { withCredentials: true }
    ).pipe(
      map((res) => res.data?.eventsByCommittee || [])
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

  public cancelCommitteeMembershipRequest(committeeId: number): Observable<CancelCommitteeMembershipRequestPayload> {
    return this.committeeMembershipRequestService
      .cancelCommitteeMembershipRequest(committeeId, true)
      .pipe(map((payload) => payload as CancelCommitteeMembershipRequestPayload));
  }
}