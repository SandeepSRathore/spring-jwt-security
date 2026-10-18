import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { authInterceptor, logInterceptor } from './core/interceptors';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Order matters: auth adds the header and handles 401s, log sits closest to the network.
    provideHttpClient(withInterceptors([authInterceptor, logInterceptor])),
    provideAppInitializer(() => inject(AuthService).restore()),
  ],
};
