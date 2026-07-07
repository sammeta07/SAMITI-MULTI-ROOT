import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { CreateProgramPayload, CreateProgramResponse } from './create-program.models';

@Injectable({
  providedIn: 'root'
})
export class CreateProgramService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public createProgram(payload: CreateProgramPayload): Observable<CreateProgramResponse> {
    const mutation = `mutation CreateProgram($input: CreateProgramInput!) {
      createProgram(input: $input) {
        id
        programId
        eventId
        programName
        address
        visibility
        startDateTime
        endDateTime
        createdBy
        updatedBy
        createdAt
      }
    }`;

    return this.http.post<{ data: { createProgram: CreateProgramResponse } }>(
      this.graphqlUrl,
      { query: mutation, variables: { input: payload } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.createProgram)
    );
  }
}
