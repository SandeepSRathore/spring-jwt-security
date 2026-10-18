package com.learning.jwtauth.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import com.learning.jwtauth.config.AppProperties;
import com.learning.jwtauth.session.AuthSession;
import com.learning.jwtauth.session.AuthSessionRepository;

/**
 * Runs after the signature has been verified. Checks lifetime with our own error codes (so
 * clients can tell "expired, go refresh" apart from "garbage, go log in") and then checks the
 * server-side session so logout, password change, theft detection and account disabling take
 * effect immediately instead of whenever the access token happens to expire.
 */
@Component
public class AccessTokenValidator implements OAuth2TokenValidator<Jwt> {

    public static final String SESSION_CLAIM = "sid";

    private final AuthSessionRepository sessions;
    private final Clock clock;
    private final Duration clockSkew;

    public AccessTokenValidator(AuthSessionRepository sessions, Clock clock, AppProperties props) {
        this.sessions = sessions;
        this.clock = clock;
        this.clockSkew = props.jwt().clockSkew();
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        Instant now = clock.instant();

        if (jwt.getExpiresAt() == null || jwt.getIssuedAt() == null || jwt.getSubject() == null
                || jwt.getId() == null || jwt.getClaimAsString(SESSION_CLAIM) == null) {
            return failure(AuthErrorCodes.INVALID_TOKEN, "Token is missing required claims");
        }
        if (now.isAfter(jwt.getExpiresAt().plus(clockSkew))) {
            return failure(AuthErrorCodes.TOKEN_EXPIRED, "Access token expired at " + jwt.getExpiresAt());
        }
        if (jwt.getNotBefore() != null && now.plus(clockSkew).isBefore(jwt.getNotBefore())) {
            return failure(AuthErrorCodes.INVALID_TOKEN, "Token is not valid yet");
        }

        Optional<AuthSession> maybeSession = parseUuid(jwt.getClaimAsString(SESSION_CLAIM))
                .flatMap(sessions::findWithUserById);
        if (maybeSession.isEmpty()) {
            return failure(AuthErrorCodes.INVALID_TOKEN, "Unknown session");
        }
        AuthSession session = maybeSession.get();
        if (!session.getUser().getId().toString().equals(jwt.getSubject())) {
            return failure(AuthErrorCodes.INVALID_TOKEN, "Token subject does not match its session");
        }
        if (!session.getUser().isEnabled()) {
            return failure(AuthErrorCodes.ACCOUNT_DISABLED, "Account is disabled");
        }
        if (session.getRevokedAt() != null) {
            return failure(AuthErrorCodes.SESSION_REVOKED, "Session was revoked (" + session.getRevokeReason() + ")");
        }
        if (!session.isActiveAt(now)) {
            return failure(AuthErrorCodes.SESSION_EXPIRED, "Session has expired; log in again");
        }
        return OAuth2TokenValidatorResult.success();
    }

    private static Optional<UUID> parseUuid(String value) {
        try {
            return Optional.of(UUID.fromString(value));
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
    }

    private static OAuth2TokenValidatorResult failure(String code, String description) {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error(code, description, null));
    }
}
