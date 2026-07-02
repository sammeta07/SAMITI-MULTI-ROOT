import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { 
  TakeActionOnCommitteeMembershipRequestResponse,
  CancelSubmittedCommitteeMembershipRequestResponse,
  ReceivedCommitteeMembershipRequestsResponse,
  SentCommitteeMembershipRequestsResponse,
  TakeActionOnCommitteeMembershipRequestBody,
  ActionTakenOnCommitteeMembershipRequestsResponse
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

  getReceivedCommitteeMembershipRequestsForAdminCommittees() {
    const query = `query ReceivedCommitteeMembershipRequestsForAdminCommittees {
      receivedCommitteeMembershipRequestsForAdminCommittees {
        statusCode
        status
        message
        data {
          committee_id
          committee_name
          area
          request_type
          request_sent_time
          user_details {
            user_id
            name
            email
            mobile
            date_of_birth
            gender
            photo
          }
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ receivedCommitteeMembershipRequestsForAdminCommittees: ReceivedCommitteeMembershipRequestsResponse }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to fetch received membership requests');
        }

        const payload = response.data?.receivedCommitteeMembershipRequestsForAdminCommittees;
        if (!payload) {
          throw new Error('Invalid received membership requests response payload');
        }

        return payload;
      })
    );
  }

  getSentCommitteeMembershipRequestsByLoggedInUser() {
    const query = `query SentCommitteeMembershipRequestsByLoggedInUser {
      sentCommitteeMembershipRequestsByLoggedInUser {
        statusCode
        status
        message
        data {
          committee_id
          committee_name
          request_type
          area
          since
          status
          request_sent_time
          resolved_by_name
          resolved_by_email
          resolved_by_photo
          resolved_at_time
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ sentCommitteeMembershipRequestsByLoggedInUser: SentCommitteeMembershipRequestsResponse }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to fetch sent membership requests');
        }

        const payload = response.data?.sentCommitteeMembershipRequestsByLoggedInUser;
        if (!payload) {
          throw new Error('Invalid sent membership requests response payload');
        }

        return payload;
      })
    );
  }

  takeActionOnCommitteeMembershipRequest(body: TakeActionOnCommitteeMembershipRequestBody) {
    const query = `mutation TakeActionOnCommitteeMembershipRequest($committeeId: Int!, $targetUserId: Int!, $decisionAction: CommitteeMembershipDecisionAction!) {
      takeActionOnCommitteeMembershipRequest(committeeId: $committeeId, targetUserId: $targetUserId, decisionAction: $decisionAction) {
        statusCode
        status
        message
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

        const payload = response.data?.takeActionOnCommitteeMembershipRequest;
        if (!payload) {
          throw new Error('Invalid take action membership request response payload');
        }

        return payload;
      })
    );
  }

  cancelSubmittedCommitteeMembershipRequest(committeeId: number) {
    const query = `mutation CancelCommitteeMembershipRequest($committeeId: Int!) {
      cancelCommitteeMembershipRequest(committeeId: $committeeId) {
        statusCode
        status
        message
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

        const payload = response.data?.cancelCommitteeMembershipRequest;
        if (!payload) {
          throw new Error('Invalid cancel submitted request response payload');
        }

        return payload;
      })
    );
  }

  getActionTakenOnCommitteeMembershipRequestsByLoggedInUser() {
    const query = `query ActionTakenOnCommitteeMembershipRequestsByLoggedInUser {
      actionTakenOnCommitteeMembershipRequestsByLoggedInUser {
        statusCode
        status
        message
        data {
          committee_id
          committee_name
          request_type
          request_sent_time
          action_at_time
          status
          user_details {
            user_id
            name
            email
            mobile
            date_of_birth
            gender
            photo
          }
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ actionTakenOnCommitteeMembershipRequestsByLoggedInUser: ActionTakenOnCommitteeMembershipRequestsResponse }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to fetch action-taken membership requests');
        }

        const payload = response.data?.actionTakenOnCommitteeMembershipRequestsByLoggedInUser;
        if (!payload) {
          throw new Error('Invalid action-taken membership requests response payload');
        }

        return payload;
      })
    );
  }
}