import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { ProgramOwnerCandidate, ProgramOwnerPayload } from './program-owner.models';

@Injectable({
  providedIn: 'root'
})
export class ProgramOwnerService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getCandidates(eventId: number): Observable<ProgramOwnerCandidate[]> {
    const query = `query ProgramOwnerCandidates($eventId: Int!) {
      programOwnerCandidates(eventId: $eventId) {
        userId
        name
      }
    }`;

    return this.http.post<{ data: { programOwnerCandidates: ProgramOwnerCandidate[] } }>(
      this.graphqlUrl,
      { query, variables: { eventId } },
      { withCredentials: true }
    ).pipe(map((response) => response.data.programOwnerCandidates));
  }

  public assignOwner(programId: number, ownerUserId: number | null): Observable<ProgramOwnerPayload> {
    const mutation = `mutation AssignProgramOwner($programId: Int!, $ownerUserId: Int) {
      assignProgramOwner(programId: $programId, ownerUserId: $ownerUserId) {
        programId
        ownerUserId
        ownerName
        ownerDesignation
        ownerDesignationColor
        ownerDesignationIcon
        ownerAssignedBy
        ownerAssignedAt
      }
    }`;

    return this.http.post<{ data: { assignProgramOwner: ProgramOwnerPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { programId, ownerUserId } },
      { withCredentials: true }
    ).pipe(map((response) => response.data.assignProgramOwner));
  }
}
