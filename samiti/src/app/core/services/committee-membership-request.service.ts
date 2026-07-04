import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

export type CommitteeMembershipRequestRole = 'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN';

export interface SubmitCommitteeMembershipRequestPayload {
  committeeId: number;
  requestedByUserId: number;
  requestedAtDateTime: string;
  requestedRole: CommitteeMembershipRequestRole;
  membershipStatus: string;
}

export interface CancelCommitteeMembershipRequestPayload {
  committeeId: number;
  cancelledByUserId: number;
  cancelledAtDateTime: string;
  membershipStatus: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class CommitteeMembershipRequestService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  submitCommitteeMembershipRequest(
    committeeId: number,
    requestRole: CommitteeMembershipRequestRole,
    withCredentials: boolean = false
  ): Observable<SubmitCommitteeMembershipRequestPayload> {
    const query = `mutation SubmitCommitteeMembershipRequest($committeeId: Int!, $requestRole: CommitteeMembershipRequestRole!) {
      submitCommitteeMembershipRequest(committeeId: $committeeId, requestRole: $requestRole) {
        committeeId
        requestedByUserId
        requestedAtDateTime
        requestedRole
        membershipStatus
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ submitCommitteeMembershipRequest: SubmitCommitteeMembershipRequestPayload }>>(
      this.graphqlUrl,
      {
        query,
        variables: {
          committeeId,
          requestRole
        }
      },
      { withCredentials }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to submit committee membership request');
        }

        const payload = response.data?.submitCommitteeMembershipRequest;
        if (!payload) {
          throw new Error('Invalid submit committee membership request response payload');
        }

        return payload;
      })
    );
  }

  cancelCommitteeMembershipRequest(
    committeeId: number,
    withCredentials: boolean = false
  ): Observable<CancelCommitteeMembershipRequestPayload> {
    const query = `mutation CancelCommitteeMembershipRequest($committeeId: Int!) {
      cancelCommitteeMembershipRequest(committeeId: $committeeId) {
        committeeId
        cancelledByUserId
        cancelledAtDateTime
        membershipStatus
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ cancelCommitteeMembershipRequest: CancelCommitteeMembershipRequestPayload }>>(
      this.graphqlUrl,
      {
        query,
        variables: {
          committeeId
        }
      },
      { withCredentials }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to cancel committee request');
        }

        const payload = response.data?.cancelCommitteeMembershipRequest;
        if (!payload) {
          throw new Error('Invalid cancel committee request response payload');
        }

        return payload;
      })
    );
  }
}
