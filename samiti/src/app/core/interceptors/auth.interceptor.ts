import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);

  // 1. Get token from centralized auth storage service
  const token = authService.getToken();

  // 2. Clone request and inject Authorization Header if token exists
  // We skip injection if it's an external third-party API or asset read if necessary
  if (token) {
    const clonedRequest = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log(`[HTTP Interceptor] Token attached cleanly to: ${req.url}`);
    return next(clonedRequest);
  }

  // 3. Fallback: Pass original request if user is not authenticated yet (like login/register APIs)
  return next(req);
};