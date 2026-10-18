import { Service, computed, signal } from '@angular/core';

import { decodeJwt } from './jwt';
import { TokenResponse } from './models';

const STORAGE_KEY = 'token-bench.refresh';

interface StoredRefresh {
  token: string;
  expiresAt: string;
}

function readStored(): StoredRefresh | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredRefresh) : null;
  } catch {
    return null;
  }
}

function writeStored(value: StoredRefresh | null): void {
  try {
    if (value) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage blocked: the session just won't survive a reload.
  }
}

/**
 * The access token lives only in memory. The refresh token is kept in sessionStorage so a
 * reload can restore the session (it is gone when the tab closes). A browser app in production
 * would rather get the refresh token as an HttpOnly cookie that scripts cannot read.
 */
@Service()
export class TokenStore {
  private readonly stored = readStored();

  readonly accessToken = signal<string | null>(null);
  readonly refreshToken = signal<string | null>(this.stored?.token ?? null);
  readonly refreshExpiresAt = signal<string | null>(this.stored?.expiresAt ?? null);

  readonly decoded = computed(() => {
    const token = this.accessToken();
    return token ? decodeJwt(token) : null;
  });
  readonly signedIn = computed(() => this.accessToken() !== null);
  readonly roles = computed(() => this.decoded()?.claims.roles ?? []);
  readonly isAdmin = computed(() => this.roles().includes('ADMIN'));
  readonly email = computed(() => this.decoded()?.claims.email ?? null);
  readonly sessionId = computed(() => this.decoded()?.claims.sid ?? null);

  setTokens(response: TokenResponse): void {
    this.accessToken.set(response.accessToken);
    this.refreshToken.set(response.refreshToken);
    this.refreshExpiresAt.set(response.refreshTokenExpiresAt);
    writeStored({ token: response.refreshToken, expiresAt: response.refreshTokenExpiresAt });
  }

  clear(): void {
    this.accessToken.set(null);
    this.refreshToken.set(null);
    this.refreshExpiresAt.set(null);
    writeStored(null);
  }
}
