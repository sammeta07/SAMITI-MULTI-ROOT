import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { 
  TakeActionOnCommitteeMembershipRequestResponse,
  CancelSubmittedCommitteeMembershipRequestResponse,
  ReceivedCommitteeMembershipRequestItem,
  SentCommitteeMembershipRequestItem,
  TakeActionOnCommitteeMembershipRequestBody,
  ActionTakenOnCommitteeMembershipRequestItem
} from './dashboard-requests.models';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

@Injectable({ providedIn: 'root' })
export class DashboardRequestsService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  getReceivedCommitteeMembershipRequestsForAdminCommittees(): Observable<ReceivedCommitteeMembershipRequestItem[]> {
    const query = `query ReceivedCommitteeMembershipRequestsForAdminCommittees {
      receivedCommitteeMembershipRequestsForAdminCommittees {
        committeeId
        committeeName
        address
        requestType
        requestSentTime
        userDetails {
          userId
          name
          email
          mobile
          dateOfBirth
          gender
          photo
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ receivedCommitteeMembershipRequestsForAdminCommittees: ReceivedCommitteeMembershipRequestItem[] }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to fetch received membership requests');
        }

        return response.data?.receivedCommitteeMembershipRequestsForAdminCommittees ?? [];
      })
    );
  }

  getSentCommitteeMembershipRequestsByLoggedInUser(): Observable<SentCommitteeMembershipRequestItem[]> {
    const query = `query SentCommitteeMembershipRequestsByLoggedInUser {
      sentCommitteeMembershipRequestsByLoggedInUser {
        committeeId
        committeeName
        requestType
        address
        establishYear
        status
        requestSentTime
        resolvedByName
        resolvedByEmail
        resolvedByPhoto
        resolvedAtTime
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ sentCommitteeMembershipRequestsByLoggedInUser: SentCommitteeMembershipRequestItem[] }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to fetch sent membership requests');
        }

        return response.data?.sentCommitteeMembershipRequestsByLoggedInUser ?? [];
      })
    );
  }

  takeActionOnCommitteeMembershipRequest(body: TakeActionOnCommitteeMembershipRequestBody) {
    const query = `mutation TakeActionOnCommitteeMembershipRequest($committeeId: Int!, $targetUserId: Int!, $decisionAction: CommitteeMembershipDecisionAction!) {
      takeActionOnCommitteeMembershipRequest(committeeId: $committeeId, targetUserId: $targetUserId, decisionAction: $decisionAction) {
        committeeId
        targetUserId
        actionAtTime
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ takeActionOnCommitteeMembershipRequest: TakeActionOnCommitteeMembershipRequestResponse }>>(this.graphqlUrl, {
      query,
      variables: {
        committeeId: body.committeeId,
        targetUserId: body.targetUserId,
        decisionAction: body.decisionAction
      }
    }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to process membership request action');
        }

        return response.data?.takeActionOnCommitteeMembershipRequest;
      })
    );
  }

  cancelSubmittedCommitteeMembershipRequest(committeeId: number) {
    const query = `mutation CancelCommitteeMembershipRequest($committeeId: Int!) {
      cancelCommitteeMembershipRequest(committeeId: $committeeId) {
        committeeId
        cancelledByUserId
        cancelledAtDateTime
        membershipStatus
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ cancelCommitteeMembershipRequest: CancelSubmittedCommitteeMembershipRequestResponse }>>(this.graphqlUrl, {
      query,
      variables: {
        committeeId
      }
    }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to cancel submitted request');
        }

        return response.data?.cancelCommitteeMembershipRequest;
      })
    );
  }

  getActionTakenOnCommitteeMembershipRequestsByLoggedInUser(): Observable<ActionTakenOnCommitteeMembershipRequestItem[]> {
    const query = `query ActionTakenOnCommitteeMembershipRequestsByLoggedInUser {
      actionTakenOnCommitteeMembershipRequestsByLoggedInUser {
        committeeId
        committeeName
        requestType
        requestSentTime
        actionAtTime
        status
        userDetails {
          userId
          name
          email
          mobile
          dateOfBirth
          gender
          photo
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ actionTakenOnCommitteeMembershipRequestsByLoggedInUser: ActionTakenOnCommitteeMembershipRequestItem[] }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to fetch action-taken membership requests');
        }

        return response.data?.actionTakenOnCommitteeMembershipRequestsByLoggedInUser ?? [];
      })
    );
  }
}