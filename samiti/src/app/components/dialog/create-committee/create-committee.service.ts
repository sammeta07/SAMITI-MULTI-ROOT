import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CreateCommitteePayload, CreateCommitteeResponse, UpdateCommitteePayload } from './create-committee.models';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CreateCommitteeService {
    private readonly http = inject(HttpClient);
        private readonly graphqlUrl = environment.graphqlUrl;

createCommittee(body: CreateCommitteePayload): Observable<CreateCommitteeResponse> {
                const query = `mutation CreateCommittee($input: CreateCommitteeInput!) {
                    createCommittee(input: $input) {
                        statusCode
                        status
                        message
                        data {
                            id
                            committeeName
                            since
                            area
                            contactNumbers
                            description
                            latitude
                            longitude
                            logo
                            createdBy
                            createdAt
                        }
                    }
                }`;

                return this.http.post<{ data: { createCommittee: any } }>(this.graphqlUrl, {
                    query,
                    variables: {
                        input: {
                            committeeName: body.name,
                            since: body.since,
                            area: body.area,
                            contactNumbers: body.contact_numbers,
                            description: body.description,
                            latitude: body.latitude,
                            longitude: body.longitude,
                            logo: body.logo
                        }
                    }
                }).pipe(
                    map((res) => {
                        const payload = res.data.createCommittee;
                        return {
                            statusCode: payload.statusCode,
                            status: payload.status,
                            message: payload.message,
                            data: {
                                id: payload.data.id,
                                committee_code: `CMT_${payload.data.id}`,
                                name: payload.data.committeeName,
                                since: payload.data.since,
                                area: payload.data.area,
                                contact_numbers: payload.data.contactNumbers,
                                description: payload.data.description,
                                logo: payload.data.logo,
                                distance: 0,
                                is_favourite: false,
                                created_at: payload.data.createdAt,
                                created_by: payload.data.createdBy
                            }
                        };
                    })
                );
    }

updateCommittee(body: UpdateCommitteePayload): Observable<CreateCommitteeResponse> {
                const query = `mutation UpdateCommittee($input: UpdateCommitteeInput!) {
                    updateCommittee(input: $input) {
                        statusCode
                        status
                        message
                        data {
                            id
                            committeeName
                            since
                            area
                            contactNumbers
                            description
                            latitude
                            longitude
                            logo
                            createdBy
                            createdAt
                        }
                    }
                }`;

                return this.http.post<{ data: { updateCommittee: any } }>(this.graphqlUrl, {
                    query,
                    variables: {
                        input: {
                            committeeId: body.committeeId,
                            committeeName: body.name,
                            since: body.since,
                            area: body.area,
                            contactNumbers: body.contact_numbers,
                            description: body.description,
                            latitude: body.latitude,
                            longitude: body.longitude,
                            logo: body.logo
                        }
                    }
                }).pipe(
                    map((res) => {
                        const payload = res.data.updateCommittee;
                        return {
                            statusCode: payload.statusCode,
                            status: payload.status,
                            message: payload.message,
                            data: {
                                id: payload.data.id,
                                committee_code: `CMT_${payload.data.id}`,
                                name: payload.data.committeeName,
                                since: payload.data.since,
                                area: payload.data.area,
                                contact_numbers: payload.data.contactNumbers,
                                description: payload.data.description,
                                logo: payload.data.logo,
                                distance: 0,
                                is_favourite: false,
                                created_at: payload.data.createdAt,
                                created_by: payload.data.createdBy
                            }
                        };
                    })
                );
    }
}