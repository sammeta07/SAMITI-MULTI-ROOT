import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AccountUpdatePayload, AccountUpdateResponse } from './account.models';
import { TextFormatService } from '../../../shared/services/text-format.service';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

@Injectable({
  providedIn: 'root',
})
export class AccountService {
  private graphqlUrl = environment.graphqlUrl;

  constructor(
    private http: HttpClient,
    private readonly textFormatService: TextFormatService
  ) {}

  updateAccount(body: AccountUpdatePayload): Observable<AccountUpdateResponse> {
    const query = `mutation UpdateAccount($input: UpdateAccountInput!) {
      updateAccount(input: $input) {
        statusCode
        status
        message
        data {
          userId
          name
          email
          mobile
          photo
        }
      }
    }`;

    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return this.http.post<GraphQLResponseEnvelope<{ updateAccount: any }>>(
      this.graphqlUrl,
      {
        query,
        variables: {
          input: {
            name: this.textFormatService.normalizeText(body.name),
            mobile: this.textFormatService.normalizeMobile(body.mobile),
            photo: body.photo ?? null
          }
        }
      },
      {
        withCredentials: true,
        headers
      }
    ).pipe(
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Failed to update account');
        }

        const payload = res.data?.updateAccount;
        if (!payload) {
          throw new Error('Invalid account update response payload');
        }

        return {
          statusCode: payload.statusCode,
          status: payload.status,
          message: payload.message,
          data: {
            user_id: payload.data.userId,
            name: payload.data.name,
            email: payload.data.email,
            mobile: payload.data.mobile,
            photo: payload.data.photo || undefined
          }
        };
      })
    );
  }

  getAccount(): Observable<AccountUpdateResponse> {
    const query = `query MyAccount {
      myAccount {
        statusCode
        status
        message
        data {
          userId
          name
          email
          mobile
          photo
        }
      }
    }`;

    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return this.http.post<GraphQLResponseEnvelope<{ myAccount: any }>>(
      this.graphqlUrl,
      { query },
      {
        withCredentials: true,
        headers
      }
    ).pipe(
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Failed to load account');
        }

        const payload = res.data?.myAccount;
        if (!payload) {
          throw new Error('Invalid account response payload');
        }

        return {
          statusCode: payload.statusCode,
          status: payload.status,
          message: payload.message,
          data: {
            user_id: payload.data.userId,
            name: payload.data.name,
            email: payload.data.email,
            mobile: payload.data.mobile,
            photo: payload.data.photo || undefined
          }
        };
      })
    );
  }
}
