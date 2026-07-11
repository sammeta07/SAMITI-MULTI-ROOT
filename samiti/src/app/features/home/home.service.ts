import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CommitteeListResponseGuestUser, CommitteeListRequestBackend, JoinCommitteeApiResponse, CancelRequestApiResponse, ToggleCommitteeFavouriteResponse, SubmitCommitteeMembershipRequestInput } from './home.models';
import { environment } from '../../../environments/environment';
import { JoinCommitteeRequestBody } from './home.models';
import { CommitteeMembershipRequestService } from '../../core/services/committee-membership-request.service';
import { sanitizeCloudinaryLogoUrl } from '../../shared/services/cloudinary-logo.util';
import { SKIP_API_ERROR_NOTIFIER } from '../../core/interceptors/api-error.interceptor';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

interface CommitteeListGraphQLPayload {
  committeesListGuestUser: CommitteeListResponseGuestUser;
  committeesListAuthUser: CommitteeListResponseGuestUser;
}


@Injectable({ providedIn: 'root' })
export class HomeService {
    private readonly http = inject(HttpClient);
    private readonly graphqlUrl = environment.graphqlUrl;
  private readonly committeeMembershipRequestService = inject(CommitteeMembershipRequestService);

    // Signal to trigger committee list refresh
    readonly refreshCommitteeList = signal<number>(0);

    getCommitteesListGuestByDistanceKm(body: CommitteeListRequestBackend) {
        const url = this.graphqlUrl;
        const query = `query committeesListGuestUser($latitude: Float!, $longitude: Float!, $distanceKm: Float!) {
          committeesListGuestUser(latitude: $latitude, longitude: $longitude, distanceKm: $distanceKm) {
            id
            address
            committeeName
            contactNumbers
            distanceMeters
            committeeLogo
            establishYear
            events {
              eventId
              eventName
              status
              type
              visibility
              startDate
              endDate
              eventBanner
              bannerImages
            }
          }
        }`;

        return this.http.post<GraphQLResponseEnvelope<CommitteeListGraphQLPayload>>(
          url,
          {
            query,
            variables: {
              latitude: body.latitude,
              longitude: body.longitude,
              distanceKm: body.distanceKm
            }
          },
          {
            context: new HttpContext().set(SKIP_API_ERROR_NOTIFIER, true)
          }
        ).pipe(
          map((res) => {
            if (res.errors?.length) {
              throw new Error(res.errors[0].message || 'Failed to fetch committees');
            }
            return (res.data?.committeesListGuestUser ?? []).map((item) => ({
              ...item,
              committeeLogo: sanitizeCloudinaryLogoUrl(item.committeeLogo)
            }));
          })
        );
    }

    getCommitteesListAuthUserByDistanceKm(body: CommitteeListRequestBackend) {
        const url = this.graphqlUrl;
        const query = `query CommitteesListAuthUser($latitude: Float!, $longitude: Float!, $distanceKm: Float!) {
          committeesListAuthUser(latitude: $latitude, longitude: $longitude, distanceKm: $distanceKm) {
            id
            address
            committeeName
            contactNumbers
            distanceMeters
            committeeLogo
            establishYear
            committeeRole
            pendingRequestRole
            status
            isFavourite
            events {
              eventId
              eventName
              status
              type
              visibility
              startDate
              endDate
              eventBanner
              bannerImages
            }
          }
        }`;

        return this.http.post<GraphQLResponseEnvelope<CommitteeListGraphQLPayload>>(url, {
          query,
          variables: {
            latitude: body.latitude,
            longitude: body.longitude,
            distanceKm: body.distanceKm
          }
        }).pipe(
          map((res) => {
            if (res.errors?.length) {
              throw new Error(res.errors[0].message || 'Failed to fetch committees');
            }
            return (res.data?.committeesListAuthUser ?? []).map((item) => ({
              ...item,
              committeeLogo: sanitizeCloudinaryLogoUrl(item.committeeLogo)
            }));
          })
        );
    }

    requestCommitteeMembershipRole(body: JoinCommitteeRequestBody): Observable<JoinCommitteeApiResponse> {
        const submitCommitteeMembershipRequestInput: SubmitCommitteeMembershipRequestInput = {
          committeeId: body.committeeId,
          requestRole: body.role
        };

        return this.committeeMembershipRequestService.submitCommitteeMembershipRequest(
          submitCommitteeMembershipRequestInput.committeeId,
          submitCommitteeMembershipRequestInput.requestRole
        ).pipe(map((payload) => payload as JoinCommitteeApiResponse));
    }

    cancelRequest(committeeId: number): Observable<CancelRequestApiResponse> {
        return this.committeeMembershipRequestService
          .cancelCommitteeMembershipRequest(committeeId)
          .pipe(map((payload) => payload as CancelRequestApiResponse));
    }

    toggleCommitteeFavourite(committeeId: number, isFavourite: number) {
        const url = this.graphqlUrl;
        const query = `mutation ToggleCommitteeFavourite($committeeId: Int!, $isFavourite: Int!) {
          toggleCommitteeFavourite(committeeId: $committeeId, isFavourite: $isFavourite) {
            committeeId
            isFavourite
          }
        }`;

        return this.http.post<GraphQLResponseEnvelope<{ toggleCommitteeFavourite: ToggleCommitteeFavouriteResponse }>>(url, {
          query,
          variables: {
            committeeId,
            isFavourite
          }
        }).pipe(
          map((res) => {
            if (res.errors?.length) {
              throw new Error(res.errors[0].message || 'Failed to toggle favourite');
            }
            return res.data?.toggleCommitteeFavourite;
          })
        );
    }
}
