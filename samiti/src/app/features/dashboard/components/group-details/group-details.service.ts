import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { CancelCommitteeMembershipRequestPayload, CommitteeDetailsPayload, CommitteeMembershipRequestRole, SubmitCommitteeMembershipRequestPayload } from './group-details.models';
import { CommitteeMembershipRequestService } from '../../../../core/services/committee-membership-request.service';

@Injectable({
  providedIn: 'root'
})
export class GroupDetailsService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;
  private readonly committeeMembershipRequestService = inject(CommitteeMembershipRequestService);

  public getCommitteeDetails(id: string): Observable<CommitteeDetailsPayload> {
    const query = `query {
      committeeDetails(id: ${id}) {
        id
        committeeId
        committeeName
        description
        address
        establishYear
        logo
        contactNumbers
        createdBy
        createdAt
        isLoggedUserAdmin
        loggedInUserAdminStatus
        loggedInUserAdminStatusActionBy
        loggedInUserAdminStatusActionAt
        members {
          id
          name
          email
          isCommitteeAdmin
        }
      }
    }`;

    return this.http.post<{ data: { committeeDetails: CommitteeDetailsPayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.committeeDetails)
    );
  }

  public requestCommitteeAdminRole(committeeId: number, requestRole: CommitteeMembershipRequestRole): Observable<SubmitCommitteeMembershipRequestPayload> {
    return this.committeeMembershipRequestService
      .submitCommitteeMembershipRequest(committeeId, requestRole, true)
      .pipe(map((payload) => payload as SubmitCommitteeMembershipRequestPayload));
  }

  public cancelCommitteeMembershipRequest(committeeId: number): Observable<CancelCommitteeMembershipRequestPayload> {
    return this.committeeMembershipRequestService
      .cancelCommitteeMembershipRequest(committeeId, true)
      .pipe(map((payload) => payload as CancelCommitteeMembershipRequestPayload));
  }
}