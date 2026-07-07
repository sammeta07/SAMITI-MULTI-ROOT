import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { ProgramDetailsPayload } from './program-details.models';

@Injectable({
  providedIn: 'root'
})
export class ProgramDetailsService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getProgramDetails(id: string): Observable<ProgramDetailsPayload> {
    const query = `query {
      programDetails(id: ${id}) {
        id
        programId
        eventId
        programName
        description
        address
        status
        visibility
        startDate
        endDate
        createdBy
        updatedBy
        createdAt
      }
    }`;

    return this.http.post<{ data: { programDetails: ProgramDetailsPayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.programDetails)
    );
  }
}
