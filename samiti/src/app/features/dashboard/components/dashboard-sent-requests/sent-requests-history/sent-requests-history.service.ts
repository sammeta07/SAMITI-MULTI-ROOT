import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { sanitizeCloudinaryLogoUrl } from '../../../../../shared/services/cloudinary-logo.util';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

export interface SentRequestsHistoryItem {
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

@Injectable({ providedIn: 'root' })
export class SentRequestsHistoryService {
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

  getSentRequestsHistory(): Observable<SentRequestsHistoryItem[]> {
    const query = `query SentRequestsHistory {
      sentRequestsHistory {
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

    return this.http.post<GraphQLResponseEnvelope<{ sentRequestsHistory: { data: SentRequestsHistoryItem[] } }>>(this.graphqlUrl, { query }).pipe(
      map((response) => {
        return this.unwrapDataArray(
          {
            data: response.data?.sentRequestsHistory,
            errors: response.errors
          },
          'Failed to fetch sent requests history'
        ).map((item) => ({
          ...item,
          committeeLogo: sanitizeCloudinaryLogoUrl(item.committeeLogo)
        }));
      })
    );
  }
}
