import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { CancelCommitteeMembershipRequestPayload, CommitteeDetailsPayload, CommitteeMembershipRequestRole, SubmitCommitteeMembershipRequestPayload } from './group-details.models';

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

  public getCommitteeDetails(id: string): Observable<CommitteeDetailsPayload> {
    const query = `query {
      committeeDetails(id: ${id}) {
        id
        committeeId
        committeeName
        description
        area
        since
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

  public submitCommitteeMembershipRequest(committeeId: number, requestRole: CommitteeMembershipRequestRole): Observable<SubmitCommitteeMembershipRequestPayload> {
    const query = `mutation SubmitCommitteeMembershipRequest($committeeId: Int!, $requestRole: CommitteeMembershipRequestRole!) {
      submitCommitteeMembershipRequest(committeeId: $committeeId, requestRole: $requestRole) {
        statusCode
        status
        message
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
      { withCredentials: true }
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

  public cancelCommitteeMembershipRequest(committeeId: number): Observable<CancelCommitteeMembershipRequestPayload> {
    const query = `mutation CancelCommitteeMembershipRequest($committeeId: Int!) {
      cancelCommitteeMembershipRequest(committeeId: $committeeId) {
        statusCode
        status
        message
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
      { withCredentials: true }
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