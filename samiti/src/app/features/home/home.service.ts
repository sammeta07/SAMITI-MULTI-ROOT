import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CommitteeListResponseGuestUser, CommitteeListRequestBackend, JoinCommitteeApiResponse, CancelRequestApiResponse, ToggleCommitteeFavouriteResponse, SubmitCommitteeMembershipRequestInput, CommitteeYearInfo, ProgramItem, ProgramListRequestBackend, ProgramListResponse } from './home.models';
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
  committeesListGuestUser: Array<{
    id: number;
    address: string;
    committeeName: string;
    contactNumbers: string[];
    distanceMeters: number;
    committeeLogo: string | null;
    establishYear: number;
    events: any[];
    availableYears: CommitteeYearInfo[];
  }>;
  committeesListAuthUser: Array<{
    id: number;
    address: string;
    committeeName: string;
    contactNumbers: string[];
    distanceMeters: number;
    committeeLogo: string | null;
    establishYear: number;
    committeeRole: string | null;
    pendingRequestRole: string | null;
    status: string | null;
    isFavourite: number;
    events: any[];
    availableYears: CommitteeYearInfo[];
  }>;
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
        const query = `query committeesListGuestUser($latitude: Float!, $longitude: Float!, $distanceKm: Float!, $year: Int, $committeeId: Int) {
          committeesListGuestUser(latitude: $latitude, longitude: $longitude, distanceKm: $distanceKm, year: $year, committeeId: $committeeId) {
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
              eventYear
              category
              address
              eventLogo
              latitude
              longitude
              startDate
              endDate
              bannerImages
            }
            availableYears {
              year
              hasEvents
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
              distanceKm: body.distanceKm,
              year: body.year,
              committeeId: body.committeeId ?? null
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
              committeeLogo: sanitizeCloudinaryLogoUrl(item.committeeLogo),
              events: item.events ?? []
            }));
          })
        );
    }

    getCommitteesListAuthUserByDistanceKm(body: CommitteeListRequestBackend) {
        const url = this.graphqlUrl;
        const query = `query CommitteesListAuthUser($latitude: Float!, $longitude: Float!, $distanceKm: Float!, $year: Int, $committeeId: Int) {
          committeesListAuthUser(latitude: $latitude, longitude: $longitude, distanceKm: $distanceKm, year: $year, committeeId: $committeeId) {
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
              eventYear
              category
              address
              eventLogo
              latitude
              longitude
              startDate
              endDate
              bannerImages
            }
            availableYears {
              year
              hasEvents
            }
          }
        }`;

        return this.http.post<GraphQLResponseEnvelope<CommitteeListGraphQLPayload>>(url, {
          query,
          variables: {
            latitude: body.latitude,
            longitude: body.longitude,
            distanceKm: body.distanceKm,
            year: body.year,
            committeeId: body.committeeId ?? null
          }
        }).pipe(
          map((res) => {
            if (res.errors?.length) {
              throw new Error(res.errors[0].message || 'Failed to fetch committees');
            }
            return (res.data?.committeesListAuthUser ?? []).map((item) => ({
              ...item,
              committeeLogo: sanitizeCloudinaryLogoUrl(item.committeeLogo),
              events: item.events ?? []
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

    getProgramsByDistanceKm(body: ProgramListRequestBackend): Observable<ProgramListResponse> {
    const url = this.graphqlUrl;
    const query = `query ProgramsByDistance($latitude: Float!, $longitude: Float!, $distanceKm: Float!, $year: Int!, $status: String!) {
      programsByDistance(latitude: $latitude, longitude: $longitude, distanceKm: $distanceKm, year: $year, status: $status) {
        id
        programName
        category
        address
        programLogo
        latitude
        longitude
        startDate
        endDate
        startTime
        endTime
        bannerImages
        distanceMeters
        committeeName
        committeeId
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ programsByDistance: ProgramItem[] }>>(url, {
      query,
      variables: {
        latitude: body.latitude,
        longitude: body.longitude,
        distanceKm: body.distanceKm,
        year: body.year,
        status: body.status ?? null
      }
    }).pipe(
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Failed to fetch programs');
        }
        return (res.data?.programsByDistance ?? []).map((item) => ({
          ...item,
          programLogo: sanitizeCloudinaryLogoUrl(item.programLogo),
          bannerImages: item.bannerImages ?? []
        }));
      })
    );
  }

  updateCommitteeLogo(committeeId: number, logo: string): Observable<{ committeeId: number; logo: string | null }> {
    const url = this.graphqlUrl;
    const query = `mutation UpdateCommitteeLogo($input: UpdateCommitteeLogoInput!) {
      updateCommitteeLogo(input: $input) {
        data {
          committeeId
          logo
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ updateCommitteeLogo: { data: { committeeId: number; logo: string | null } } }>>(url, {
      query,
      variables: {
        input: {
          committeeId,
          logo
        }
      }
    }).pipe(
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Failed to update committee logo');
        }
        const data = res.data?.updateCommitteeLogo?.data;
        return {
          committeeId: Number(data?.committeeId ?? committeeId),
          logo: sanitizeCloudinaryLogoUrl(data?.logo ?? logo)
        };
      })
    );
  }
}
