import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CommitteeListResponseGuestUser, CommitteeListRequestBackend, JoinCommitteeApiResponse, CancelRequestApiResponse, ToggleCommitteeFavouriteResponse, SubmitCommitteeMembershipRequestInput } from './home.models';
import { environment } from '../../../environments/environment';
import { JoinCommitteeRequestBody } from './home.models';
import { CommitteeMembershipRequestService } from '../../core/services/committee-membership-request.service';

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
            description
            distanceKm
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
            return res.data?.committeesListGuestUser ?? [];
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
            description
            distanceKm
            committeeLogo
            establishYear
            isCommitteeAdmin
            isCommitteeMember
            membershipStatus
            membershipStatusActionBy
            membershipStatusActionAt
            adminStatus
            adminStatusActionBy
            adminStatusActionAt
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
            return res.data?.committeesListAuthUser ?? [];
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
