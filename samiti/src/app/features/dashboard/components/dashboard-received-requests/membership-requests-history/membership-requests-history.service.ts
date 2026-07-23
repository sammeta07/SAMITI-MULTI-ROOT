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

export interface CommitteeMembershipRequestHistoryItem {
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

@Injectable({ providedIn: 'root' })
export class MembershipRequestsHistoryService {
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

  getReceivedRequestsHistory(): Observable<CommitteeMembershipRequestHistoryItem[]> {
    const query = `query ReceivedRequestsHistory {
      receivedRequestsHistory {
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

    return this.http.post<GraphQLResponseEnvelope<{ receivedRequestsHistory: { data: CommitteeMembershipRequestHistoryItem[] } }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        return this.unwrapDataArray(
          {
            data: response.data?.receivedRequestsHistory,
            errors: response.errors
          },
          'Failed to fetch requests history'
        ).map((item) => ({
          ...item,
          committeeLogo: sanitizeCloudinaryLogoUrl(item.committeeLogo)
        }));
      })
    );
  }
}
