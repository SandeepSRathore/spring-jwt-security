package com.learning.jwtauth.security;

/** The "error" values returned in 401/403 bodies. Clients should branch on these, not on messages. */
public final class AuthErrorCodes {

    public static final String MISSING_TOKEN = "missing_token";
    public static final String INVALID_TOKEN = "invalid_token";
    public static final String TOKEN_EXPIRED = "token_expired";
    public static final String SESSION_REVOKED = "session_revoked";
    public static final String SESSION_EXPIRED = "session_expired";
    public static final String ACCOUNT_DISABLED = "account_disabled";
    public static final String ACCESS_DENIED = "access_denied";

    public static final String INVALID_CREDENTIALS = "invalid_credentials";
    public static final String ACCOUNT_LOCKED = "account_locked";
    public static final String TOO_MANY_REQUESTS = "too_many_requests";

    public static final String INVALID_REFRESH_TOKEN = "invalid_refresh_token";
    public static final String REFRESH_TOKEN_EXPIRED = "refresh_token_expired";
    public static final String REFRESH_TOKEN_REUSED = "refresh_token_reused";

    private AuthErrorCodes() {
    }
}
