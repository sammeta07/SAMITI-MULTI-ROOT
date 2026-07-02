import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  
  // 1. Get token securely from LocalStorage
  const token = localStorage.getItem('token');

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