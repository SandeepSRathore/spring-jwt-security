package com.learning.jwtauth.common;

import org.springframework.http.HttpStatus;

/**
 * A failure with a stable, machine-readable {@code code} that clients can branch on
 * (e.g. "token_expired" means "call /refresh", "refresh_token_reused" means "log in again").
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Long retryAfterSeconds;

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }

    public ApiException(HttpStatus status, String code, String message, Long retryAfterSeconds) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public Long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
