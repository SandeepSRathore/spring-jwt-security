import { HttpErrorResponse } from '@angular/common/http';

import { ApiFailure } from './models';

export function toApiFailure(error: unknown): ApiFailure {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return {
        status: 0,
        code: 'network_error',
        message: 'Can’t reach the API. Start the Spring Boot app on port 8080.',
      };
    }
    const body = error.error as Partial<{ error: string; message: string; fieldErrors: Record<string, string> }> | null;
    return {
      status: error.status,
      code: body?.error ?? `http_${error.status}`,
      message: body?.message ?? error.statusText,
      fieldErrors: body?.fieldErrors,
    };
  }
  return { status: -1, code: 'client_error', message: error instanceof Error ? error.message : String(error) };
}

/** Plain-language explanations shown on the sign-in page when the app ends a session. */
export const SESSION_END_REASONS: Record<string, string> = {
  refresh_token_reused:
    'A refresh token was used twice, which looks like theft. The server revoked the whole session, so every token from it is dead.',
  session_revoked: 'This session was revoked: a logout, a password change on another device, or theft detection.',
  session_expired: 'This session reached its maximum lifetime.',
  refresh_token_expired: 'The refresh token expired, so the app couldn’t get a new access token.',
  invalid_refresh_token: 'The server doesn’t recognise the saved refresh token.',
  invalid_token: 'The server rejected the access token.',
  account_disabled: 'An administrator disabled this account.',
  signed_out: 'You signed out. The session is revoked on the server.',
  signed_out_everywhere: 'You signed out on every device.',
};
