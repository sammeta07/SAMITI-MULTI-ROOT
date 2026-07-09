import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AccountUpdatePayload, AccountUpdateResponse } from './account.models';
import { TextFormatService } from '../../../shared/services/text-format-service.service';
import { AuthService } from '../../../core/services/auth.service';

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
    private readonly textFormatService: TextFormatService,
    private readonly authService: AuthService
  ) {}

  updateAccount(body: AccountUpdatePayload): Observable<AccountUpdateResponse> {
    const query = `mutation UpdateAccount($input: UpdateAccountInput!) {
      updateAccount(input: $input) {
        data {
          userId
          name
          email
          mobile
          photo
        }
      }
    }`;

    const token = this.authService.getToken();
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

        return res.data?.updateAccount?.data;
      })
    );
  }

}
