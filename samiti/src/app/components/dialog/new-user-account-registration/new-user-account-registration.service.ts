import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { NewUserAccountRegistrationPayload, NewUserAccountRegistrationResponse } from './new-user-account-registration.models';
import { TextFormatService } from '../../../shared/services/text-format-service.service';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

interface RegistrationValidationResponse {
  isValid: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class NewUserAccountRegistrationService {
  private graphqlUrl = environment.graphqlUrl;

  constructor(
    private http: HttpClient,
    private readonly textFormatService: TextFormatService
  ) {}

  validateRegistration(body: NewUserAccountRegistrationPayload): Observable<RegistrationValidationResponse> {
    const query = `mutation ValidateNewUserAccountRegistration($input: NewUserAccountRegistrationInput!) {
      validateNewUserAccountRegistration(input: $input) {
        isValid
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ validateNewUserAccountRegistration: RegistrationValidationResponse }>>(this.graphqlUrl, {
      query,
      variables: {
        input: {
          name: this.textFormatService.normalizeText(body.name),
          email: this.textFormatService.normalizeEmail(body.email),
          mobile: this.textFormatService.normalizeMobile(body.mobile),
          dateOfBirth: body.dateOfBirth,
          gender: this.textFormatService.normalizeGender(body.gender),
          password: body.password,
          profilePhoto: null,
          fcmToken: body.fcmToken ?? null,
          baseRole: body.baseRole ?? 'AUTH_USER'
        }
      }
    }).pipe(
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Registration validation failed.');
        }

        const payload = res.data?.validateNewUserAccountRegistration;
        if (!payload || !payload.isValid) {
          throw new Error('Registration validation failed.');
        }

        return payload;
      })
    );
  }

  register(body: NewUserAccountRegistrationPayload): Observable<NewUserAccountRegistrationResponse> {
    const query = `mutation SubmitNewUserAccountRegistration($input: NewUserAccountRegistrationInput!) {
      submitNewUserAccountRegistration(input: $input) {
        data {
          id
          name
          email
          mobile
          dateOfBirth
          gender
          baseRole
          profilePhoto
          fcmToken
          createdAt
          updatedAt
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ submitNewUserAccountRegistration: { data: NewUserAccountRegistrationResponse } }>>(this.graphqlUrl, {
      query,
      variables: {
        input: {
          name: this.textFormatService.normalizeText(body.name),
          email: this.textFormatService.normalizeEmail(body.email),
          mobile: this.textFormatService.normalizeMobile(body.mobile),
          dateOfBirth: body.dateOfBirth,
          gender: this.textFormatService.normalizeGender(body.gender),
          password: body.password,
          profilePhoto: body.profilePhoto ?? null,
          fcmToken: body.fcmToken ?? null,
          baseRole: body.baseRole ?? 'AUTH_USER'
        }
      }
    }).pipe(
      map((res) => {
        if (res.errors?.length) {
          throw new Error(res.errors[0].message || 'Registration failed. Please try again.');
        }

        const payload = res.data?.submitNewUserAccountRegistration?.data;
        if (!payload) {
          throw new Error('Registration failed. Please try again.');
        }

        return payload;
      })
    );
  }
}
