export interface TokenResponse {
  tokenType: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
}

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  roles: string[];
  createdAt: string;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  roles: string[];
  enabled: boolean;
  locked: boolean;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  activeSessions: number;
}

export interface AccessClaims {
  sub: string;
  email: string;
  roles: string[];
  sid: string;
  jti: string;
  iss: string;
  aud: string | string[];
  iat: number;
  nbf?: number;
  exp: number;
}

export interface DecodedJwt {
  segments: [string, string, string];
  header: Record<string, unknown>;
  claims: AccessClaims;
}

/** What the UI needs from any failed call: the backend's stable error code plus a readable message. */
export interface ApiFailure {
  status: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}
