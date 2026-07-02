import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DashboardCommitteesService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  // 🚀 CREATE
  public createCommittee(payload: any): Observable<any> {
    const query = `mutation CreateCommittee($input: CreateCommitteeInput!) {
      createCommittee(input: $input) {
        id
        committeeName
        establishYear
        address
        contactNumbers
        description
        latitude
        longitude
        logo
        createdBy
        createdAt
      }
    }`;

    return this.http.post<{ data: { createCommittee: any } }>(
      this.graphqlUrl,
      {
        query,
        variables: {
          input: {
            committeeName: payload.name,
            establishYear: payload.establishYear ?? payload.establish_year,
            address: payload.address,
            contactNumbers: payload.contactNumbers ?? payload.contact_numbers,
            description: payload.description,
            latitude: payload.latitude,
            longitude: payload.longitude,
            logo: payload.logo
          }
        }
      }
    ).pipe(
      map((res) => res.data.createCommittee)
    );
  }

}