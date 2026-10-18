import { HttpClient, HttpContext } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap, throwError } from 'rxjs';

import { SESSION_END_REASONS, toApiFailure } from './api-failure';
import { LOG_NOTE } from './http-context';
import { TokenResponse, UserProfile } from './models';
import { TokenStore } from './token-store';

export interface SessionNotice {
  code: string;
  message: string;
}

@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(TokenStore);
  private readonly router = inject(Router);

  /** When on, a 401 token_expired is answered by refreshing and retrying the request once. */
  readonly autoRefresh = signal(true);
  /** Why the last session ended; shown on the sign-in page. */
  readonly notice = signal<SessionNotice | null>(null);

  private inflightRefresh: Observable<TokenResponse> | null = null;

  login(email: string, password: string): Observable<TokenResponse> {
    return this.http.post<TokenResponse>('/api/auth/login', { email, password }).pipe(
      tap((response) => {
        this.store.setTokens(response);
        this.notice.set(null);
      }),
    );
  }

  register(name: string, email: string, password: string): Observable<UserProfile> {
    return this.http.post<UserProfile>('/api/auth/register', { name, email, password });
  }

  /**
   * Single-flight: every caller that needs a refresh while one is already running shares it.
   * The server treats a second use of the same refresh token as theft and revokes the session,
   * so two parallel refreshes would sign the user out.
   */
  refresh(note = 'refresh'): Observable<TokenResponse> {
    if (this.inflightRefresh) {
      return this.inflightRefresh;
    }
    const refreshToken = this.store.refreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token'));
    }
    this.inflightRefresh = this.http
      .post<TokenResponse>(
        '/api/auth/refresh',
        { refreshToken },
        { context: new HttpContext().set(LOG_NOTE, note) },
      )
      .pipe(
        tap((response) => this.store.setTokens(response)),
        catchError((error: unknown) => {
          const failure = toApiFailure(error);
          if (failure.status === 401) {
            this.endSession(failure.code, failure.message);
          }
          return throwError(() => error);
        }),
        finalize(() => (this.inflightRefresh = null)),
        shareReplay(1),
      );
    return this.inflightRefresh;
  }

  /** Revokes this session on the server (by refresh token, so it works even with an expired access token). */
  async logout(): Promise<void> {
    const refreshToken = this.store.refreshToken();
    if (refreshToken) {
      await firstValueFrom(this.http.post<void>('/api/auth/logout', { refreshToken })).catch(() => undefined);
    }
    this.endSession('signed_out');
  }

  async logoutEverywhere(): Promise<number> {
    const result = await firstValueFrom(this.http.post<{ sessionsRevoked: number }>('/api/auth/logout-all', {}));
    this.endSession('signed_out_everywhere');
    this.notice.set({ code: 'signed_out_everywhere', message: `You signed out of ${result.sessionsRevoked} session(s) on every device.` });
    return result.sessionsRevoked;
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ message: string; otherSessionsRevoked: number }> {
    return this.http.post<{ message: string; otherSessionsRevoked: number }>('/api/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }

  /** Called on app start: trade the saved refresh token for a fresh access token. */
  restore(): Promise<void> {
    if (!this.store.refreshToken()) {
      return Promise.resolve();
    }
    return firstValueFrom(this.refresh('restore after reload').pipe(map(() => undefined), catchError(() => of(undefined))));
  }

  endSession(code: string, serverMessage?: string): void {
    this.store.clear();
    this.notice.set({ code, message: SESSION_END_REASONS[code] ?? serverMessage ?? 'Your session ended.' });
    void this.router.navigate(['/login']);
  }
}
