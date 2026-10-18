package com.learning.jwtauth.session;

public enum RevokeReason {
    LOGOUT,
    LOGOUT_ALL,
    REVOKED_BY_USER,
    PASSWORD_CHANGED,
    REFRESH_TOKEN_REUSE,
    SESSION_LIMIT,
    ACCOUNT_DISABLED
}
