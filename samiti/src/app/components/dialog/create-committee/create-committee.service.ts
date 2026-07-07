import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CreateCommitteePayload, CreateCommitteeResponse, UpdateCommitteePayload } from './create-committee.models';
import { environment } from '../../../../environments/environment';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

@Injectable({ providedIn: 'root' })
export class CreateCommitteeService {
    private readonly http = inject(HttpClient);
        private readonly graphqlUrl = environment.graphqlUrl;

createCommittee(body: CreateCommitteePayload): Observable<any> {
                const query = `mutation CreateCommittee($input: CreateCommitteeInput!) {
                    createCommittee(input: $input) {
                        data {
                            id
                            committeeName
                            establishYear
                            address
                            contactNumbers
                            latitude
                            longitude
                            createdBy
                            createdAt
                        }
                    }
                }`;

                return this.http.post<GraphQLResponseEnvelope<{ createCommittee: any }>>(this.graphqlUrl, {
                    query,
                    variables: {
                        input: {
                            committeeName: body.name,
                            establishYear: body.establish_year,
                            address: body.address,
                            contactNumbers: body.contact_numbers,
                            latitude: body.latitude,
                            longitude: body.longitude
                        }
                    }
                }).pipe(
                    map((res) => {
                        if (res.errors?.length) {
                            throw new Error(res.errors[0].message || 'Failed to create committee');
                        }
                        return res.data?.createCommittee?.data;
                    })
                );
    }

updateCommittee(body: UpdateCommitteePayload): Observable<any> {
                const query = `mutation UpdateCommittee($input: UpdateCommitteeInput!) {
                    updateCommittee(input: $input) {
                        data {
                            id
                            committeeName
                            establishYear
                            address
                            contactNumbers
                            latitude
                            longitude
                            createdBy
                            createdAt
                        }
                    }
                }`;

                return this.http.post<GraphQLResponseEnvelope<{ updateCommittee: any }>>(this.graphqlUrl, {
                    query,
                    variables: {
                        input: {
                            committeeId: body.committeeId,
                            committeeName: body.name,
                            establishYear: body.establish_year,
                            address: body.address,
                            contactNumbers: body.contact_numbers,
                            latitude: body.latitude,
                            longitude: body.longitude
                        }
                    }
                }).pipe(
                    map((res) => {
                        if (res.errors?.length) {
                            throw new Error(res.errors[0].message || 'Failed to update committee');
                        }
                        return res.data?.updateCommittee?.data;
                    })
                );
    }
}