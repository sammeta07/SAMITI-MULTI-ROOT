import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http'; // 🛠️ Added withInterceptors import
import { provideNativeDateAdapter } from '@angular/material/core';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor'; // 🛠️ Import your interceptor file path

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    
    // 🚀 Configured HttpClient to handle standard Fetch API along with our functional token interceptor
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor])
    ),
    
    provideNativeDateAdapter(),
  ]
};