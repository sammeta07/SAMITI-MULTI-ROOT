import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { sanitizeCloudinaryLogoUrl } from '../../../../shared/services/cloudinary-logo.util';

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

export interface SentCommitteeMembershipRequestItem {
  committeeId: number;
  committeeName: string;
  committeeLogo: string | null;
  requesterUserId: number;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterPhoto: string | null;
  actionByUserId: number | null;
  requestType: string;
  address: string;
  establishYear: number | null;
  status: string;
  requestSentTime: string;
  resolvedByName: string | null;
  resolvedByEmail: string | null;
  resolvedByPhoto: string | null;
  resolvedAtTime: string | null;
}

export interface CancelSubmittedCommitteeMembershipRequestResponse {
  committeeId: number;
  cancelledByUserId: number;
  cancelledAtDateTime: string;
  membershipStatus: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardSentRequestsService {
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
