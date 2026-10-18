import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, tap, throwError } from 'rxjs';

import { toApiFailure } from './api-failure';
import { AuthService } from './auth.service';
import { LOG_NOTE } from './http-context';
import { RequestLog } from './request-log';
import { TokenStore } from './token-store';

/** The backend ignores the Authorization header on these, so don't send it. */
const PUBLIC_AUTH = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout'];

/** 401 codes after which the stored tokens are useless and the user must sign in again. */
const SESSION_OVER = new Set(['session_revoked', 'session_expired', 'account_disabled', 'invalid_token']);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(TokenStore);
  const auth = inject(AuthService);

  if (!req.url.startsWith('/api/') || PUBLIC_AUTH.includes(req.url)) {
    return next(req);
  }
  const token = store.accessToken();
  const withToken = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withToken).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      const { code, message } = toApiFailure(error);
      if (code === 'token_expired' && auth.autoRefresh() && store.refreshToken()) {
        return auth.refresh('auto, after token_expired').pipe(
          switchMap((tokens) => {
            req.context.set(LOG_NOTE, 'retry with new token');
            return next(req.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }));
          }),
        );
      }
      if (SESSION_OVER.has(code)) {
        auth.endSession(code, message);
      }
      return throwError(() => error);
    }),
  );
};

/** Registered last, so it records every request that actually goes over the wire, retries included. */
export const logInterceptor: HttpInterceptorFn = (req, next) => {
  const log = inject(RequestLog);
  const started = Date.now();
  const base = {
    method: req.method,
    path: req.urlWithParams,
    sentToken: req.headers.has('Authorization'),
    note: req.context.get(LOG_NOTE),
  };
  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          log.add({ ...base, at: started, status: event.status, code: null, durationMs: Date.now() - started });
        }
      },
      error: (error: unknown) => {
        const failure = toApiFailure(error);
        log.add({ ...base, at: started, status: failure.status, code: failure.code, durationMs: Date.now() - started });
      },
    }),
  );
};
