import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { LoginPayload, LoginResponse, LoginUserData } from './login.models';
import { TextFormatService } from '../../../shared/services/text-format-service.service';

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  private graphqlUrl = environment.graphqlUrl;

  constructor(
    private http: HttpClient,
    private readonly textFormatService: TextFormatService
  ) {}

  login(body: LoginPayload): Observable<LoginResponse> {
    const url = this.graphqlUrl;
    const query = `mutation Login($email: String!, $password: String!, $fcmToken: String) {
      login(email: $email, password: $password, fcmToken: $fcmToken) {
        token
        user {
          id
          name
          email
          dateOfBirth
          gender
          mobile
          baseRole
          profilePhoto
          fcmToken
        }
      }
    }`;

    return this.http.post<{ data: { login: LoginResponse } }>(url, {
      query,
      variables: {
        email: this.textFormatService.normalizeEmail(body.email),
        password: body.password,
        fcmToken: body.fcmToken || null
      }
    }).pipe(
      map(res => res.data.login)
    );
  }

  userAccountRoles(): Observable<LoginUserData['accountRoles']> {
    const url = this.graphqlUrl;
    const query = `query UserAccountRoles {
      userAccountRoles {
        committees {
          committeeId
          committeeName
          committeeLogo
          committeeRole
          roleLabel
          events {
            eventId
            eventName
            committeeId
            committeeName
            committeeLogo
            designation
            membershipStatus
            eventStatus
            eventVisibility
          }
        }
      }
    }`;

    return this.http.post<{ data: { userAccountRoles: LoginUserData['accountRoles'] } }>(url, { query }).pipe(
      map(res => res.data.userAccountRoles)
    );
  }
}