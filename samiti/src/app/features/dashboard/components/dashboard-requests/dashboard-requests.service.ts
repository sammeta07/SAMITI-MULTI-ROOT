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
  TakeActionOnCommitteeMembershipRequestBody
} from './dashboard-requests.models';
import { sanitizeCloudinaryLogoUrl } from '../../../../shared/services/cloudinary-logo.util';

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

  private unwrapDataArray<TItem>(
    response: GraphQLResponseEnvelope<{ data: TItem[] }>,
    fallbackErrorMessage: string
  ): TItem[] {
    if (response.errors?.length) {
      throw new Error(response.errors[0].message || fallbackErrorMessage);
    }

    return response.data?.data ?? [];
  }

  getReceivedCommitteeMembershipRequestsForAdminCommittees(): Observable<ReceivedCommitteeMembershipRequestItem[]> {
    const query = `query ReceivedCommitteeMembershipRequestsForAdminCommittees {
      receivedCommitteeMembershipRequestsForAdminCommittees {
        data {
          committeeId
          committeeName
          committeeLogo
          address
          actionByUserId
          resolvedByName
          resolvedByPhoto
          requestRole
          requestSentTime
          resolvedAtTime
          status
          committeeRole
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
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ receivedCommitteeMembershipRequestsForAdminCommittees: { data: ReceivedCommitteeMembershipRequestItem[] } }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        return this.unwrapDataArray(
          {
            data: response.data?.receivedCommitteeMembershipRequestsForAdminCommittees,
            errors: response.errors
          },
          'Failed to fetch received membership requests'
        ).map((item) => ({
          ...item,
          committeeLogo: sanitizeCloudinaryLogoUrl(item.committeeLogo)
        }));
      })
    );
  }

  getSentCommitteeMembershipRequestsByLoggedInUser(): Observable<SentCommitteeMembershipRequestItem[]> {
    const query = `query SentCommitteeMembershipRequestsByLoggedInUser {
      sentCommitteeMembershipRequestsByLoggedInUser {
        data {
          committeeId
          committeeName
          committeeLogo
          requesterUserId
          requesterName
          requesterEmail
          requesterPhoto
          actionByUserId
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
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ sentCommitteeMembershipRequestsByLoggedInUser: { data: SentCommitteeMembershipRequestItem[] } }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        return this.unwrapDataArray(
          {
            data: response.data?.sentCommitteeMembershipRequestsByLoggedInUser,
            errors: response.errors
          },
          'Failed to fetch sent membership requests'
        ).map((item) => ({
          ...item,
          committeeLogo: sanitizeCloudinaryLogoUrl(item.committeeLogo)
        }));
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

}