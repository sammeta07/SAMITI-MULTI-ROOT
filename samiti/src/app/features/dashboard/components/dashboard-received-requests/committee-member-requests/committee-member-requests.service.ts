import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { sanitizeCloudinaryLogoUrl } from '../../../../../../app/shared/services/cloudinary-logo.util';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

export interface CommitteeMembershipRequesterUserDetails {
  userId: number;
  name: string;
  email: string;
  mobile: string;
  dateOfBirth: string;
  gender: string;
  photo: string | null;
}

export interface ReceivedCommitteeMembershipRequestItem {
  committeeId: number;
  committeeName: string;
  committeeLogo: string | null;
  address: string | null;
  actionByUserId: number | null;
  resolvedByName: string | null;
  resolvedByPhoto: string | null;
  requestRole: string;
  requestSentTime: string;
  resolvedAtTime: string | null;
  status: string;
  committeeRole: string | null;
  userDetails: CommitteeMembershipRequesterUserDetails;
}

export interface TakeActionOnCommitteeMembershipRequestResponse {
  committeeId: number;
  targetUserId: number;
  actionAtTime: string;
}

export interface TakeActionOnCommitteeMembershipRequestBody {
  committeeId: number;
  targetUserId: number;
  decisionAction: 'ACCEPTED' | 'REJECTED';
}

@Injectable({ providedIn: 'root' })
export class CommitteeMemberRequestsService {
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

  getReceivedCommitteeMemberRequests(): Observable<ReceivedCommitteeMembershipRequestItem[]> {
    const query = `query ReceivedCommitteeMemberRequests {
      receivedCommitteeMemberRequests {
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

    return this.http.post<GraphQLResponseEnvelope<{ receivedCommitteeMemberRequests: { data: ReceivedCommitteeMembershipRequestItem[] } }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        return this.unwrapDataArray(
          {
            data: response.data?.receivedCommitteeMemberRequests,
            errors: response.errors
          },
          'Failed to fetch member requests'
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
}
