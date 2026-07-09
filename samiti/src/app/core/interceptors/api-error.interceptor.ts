import { inject } from '@angular/core';
import {
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { NotifierService } from '../../shared/notifier/notifier.service';

type NotifiedError = Error & { __alreadyNotifiedByApiInterceptor?: boolean };

type GraphQLErrorResponse = {
  errors?: Array<{ message?: string }>;
};

export const SKIP_API_ERROR_NOTIFIER = new HttpContextToken<boolean>(() => false);

function extractGraphQLErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const maybeGraphQLBody = body as GraphQLErrorResponse;
  const firstMessage = maybeGraphQLBody.errors?.[0]?.message;

  if (typeof firstMessage === 'string' && firstMessage.trim()) {
    return firstMessage.trim();
  }

  return null;
}

function extractHttpErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const graphqlMessage = extractGraphQLErrorMessage(error.error);
    if (graphqlMessage) {
      return graphqlMessage;
    }

    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error.trim();
    }

    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return 'Request failed. Please try again.';
}

export const apiErrorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const notifier = inject(NotifierService);
  const shouldNotify = !req.context.get(SKIP_API_ERROR_NOTIFIER);

  return next(req).pipe(
    mergeMap((event) => {
      if (event instanceof HttpResponse) {
        const graphqlMessage = extractGraphQLErrorMessage(event.body);
        if (graphqlMessage) {
          if (shouldNotify) {
            notifier.error(graphqlMessage);
          }
          const handledError = new Error(graphqlMessage) as NotifiedError;
          if (shouldNotify) {
            handledError.__alreadyNotifiedByApiInterceptor = true;
          }
          return throwError(() => handledError);
        }
      }

      return [event];
    }),
    catchError((error) => {
      if (!shouldNotify) {
        return throwError(() => error);
      }

      if ((error as NotifiedError)?.__alreadyNotifiedByApiInterceptor) {
        return throwError(() => error);
      }

      notifier.error(extractHttpErrorMessage(error));
      return throwError(() => error);
    })
  );
};