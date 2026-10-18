package com.learning.jwtauth.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.learning.jwtauth.auth.AuthDtos.ChangePasswordRequest;
import com.learning.jwtauth.auth.AuthDtos.ChangePasswordResponse;
import com.learning.jwtauth.auth.AuthDtos.ClientInfo;
import com.learning.jwtauth.auth.AuthDtos.LoginRequest;
import com.learning.jwtauth.auth.AuthDtos.RegisterRequest;
import com.learning.jwtauth.auth.AuthDtos.SessionResponse;
import com.learning.jwtauth.auth.AuthDtos.TokenResponse;
import com.learning.jwtauth.auth.AuthDtos.UserResponse;
import com.learning.jwtauth.common.ApiException;
import com.learning.jwtauth.config.AppProperties;
import com.learning.jwtauth.security.AuthErrorCodes;
import com.learning.jwtauth.security.TokenService;
import com.learning.jwtauth.security.TokenService.IssuedAccessToken;
import com.learning.jwtauth.session.AuthSession;
import com.learning.jwtauth.session.AuthSessionRepository;
import com.learning.jwtauth.session.RefreshToken;
import com.learning.jwtauth.session.RefreshTokenRepository;
import com.learning.jwtauth.session.RevokeReason;
import com.learning.jwtauth.user.Role;
import com.learning.jwtauth.user.User;
import com.learning.jwtauth.user.UserRepository;

/**
 * Methods that record security state and then fail (a failed login counting towards lock-out,
 * a replayed refresh token revoking its session) use noRollbackFor so that state is committed
 * even though the request is rejected.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository users;
    private final AuthSessionRepository sessions;
    private final RefreshTokenRepository refreshTokens;
    private final TokenService tokenService;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties props;
    private final Clock clock;
    // Compared against when the email is unknown, so "no such user" costs the same time as
    // "wrong password" and response timing does not reveal which accounts exist.
    private final String dummyPasswordHash;

    public AuthService(UserRepository users, AuthSessionRepository sessions, RefreshTokenRepository refreshTokens,
                       TokenService tokenService, PasswordEncoder passwordEncoder, AppProperties props, Clock clock) {
        this.users = users;
        this.sessions = sessions;
        this.refreshTokens = refreshTokens;
        this.tokenService = tokenService;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
        this.clock = clock;
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (users.existsByEmail(email)) {
            throw emailTaken();
        }
        User user = new User(email, request.name().strip(), passwordEncoder.encode(request.password()),
                Set.of(Role.USER), clock.instant());
        try {
            return UserResponse.from(users.saveAndFlush(user));
        } catch (DataIntegrityViolationException ex) {
            throw emailTaken(); // lost a race with a concurrent registration
        }
    }

    @Transactional(noRollbackFor = ApiException.class)
    public TokenResponse login(LoginRequest request, ClientInfo client) {
        Instant now = clock.instant();
        User user = users.findByEmail(normalizeEmail(request.email())).orElse(null);
        if (user == null) {
            passwordEncoder.matches(request.password(), dummyPasswordHash);
            throw invalidCredentials();
        }
        if (user.isLockedAt(now)) {
            throw locked(user.getLockedUntil(), now);
        }
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            Instant lockUntil = now.plus(props.login().lockDuration());
            if (user.registerFailedLogin(props.login().maxFailedAttempts(), lockUntil)) {
                log.warn("SECURITY account locked after repeated failed logins userId={} ip={}",
                        user.getId(), client.ipAddress());
                throw locked(lockUntil, now);
            }
            throw invalidCredentials();
        }
        // Only reveal "disabled" to someone who proved they know the password.
        if (!user.isEnabled()) {
            throw new ApiException(HttpStatus.FORBIDDEN, AuthErrorCodes.ACCOUNT_DISABLED, "Account is disabled");
        }
        user.registerSuccessfulLogin();
        enforceSessionLimit(user.getId(), now);

        AuthSession session = sessions.save(new AuthSession(user, now, now.plus(props.session().absoluteTtl()),
                client.ipAddress(), client.userAgent()));
        log.info("Login userId={} sessionId={} ip={}", user.getId(), session.getId(), client.ipAddress());
        return issueTokens(user, session, now);
    }

    /**
     * Refresh-token rotation with reuse detection. Every refresh consumes the presented token and
     * returns a new one. If an already-consumed token shows up again, two parties hold copies of
     * it (the legitimate client and a thief), and we cannot tell which is which, so the whole
     * session is revoked: both the thief's and the victim's tokens stop working.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public TokenResponse refresh(String rawRefreshToken) {
        Instant now = clock.instant();
        RefreshToken token = refreshTokens.findWithSessionByTokenHash(TokenService.hash(rawRefreshToken))
                .orElseThrow(() -> unauthorized(AuthErrorCodes.INVALID_REFRESH_TOKEN, "Refresh token is not recognised"));
        AuthSession session = token.getSession();
        User user = session.getUser();

        if (session.getRevokedAt() != null) {
            throw unauthorized(AuthErrorCodes.SESSION_REVOKED,
                    "Session was revoked (" + session.getRevokeReason() + "); log in again");
        }
        if (token.getUsedAt() != null) {
            throw revokeForReuse(session, user);
        }
        if (!token.getExpiresAt().isAfter(now)) {
            throw unauthorized(AuthErrorCodes.REFRESH_TOKEN_EXPIRED, "Refresh token expired; log in again");
        }
        if (!session.isActiveAt(now)) {
            throw unauthorized(AuthErrorCodes.SESSION_EXPIRED, "Session reached its maximum lifetime; log in again");
        }
        if (!user.isEnabled()) {
            throw unauthorized(AuthErrorCodes.ACCOUNT_DISABLED, "Account is disabled");
        }

        session.touch(now);
        if (refreshTokens.markUsed(token.getId(), now) == 0) {
            // A concurrent request consumed this token between our read and our update.
            throw revokeForReuse(session, user);
        }
        return issueTokens(user, session, now);
    }

    /** Idempotent: unknown or already-revoked tokens still return success (RFC 7009 style). */
    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokens.findWithSessionByTokenHash(TokenService.hash(rawRefreshToken))
                .ifPresent(t -> sessions.revoke(t.getSession().getId(), RevokeReason.LOGOUT, clock.instant()));
    }

    @Transactional
    public int logoutAll(Long userId) {
        return sessions.revokeAllForUser(userId, RevokeReason.LOGOUT_ALL, clock.instant());
    }

    @Transactional(readOnly = true)
    public List<SessionResponse> activeSessions(Long userId, UUID currentSessionId) {
        return sessions.findActiveByUserId(userId, clock.instant()).stream()
                .map(s -> SessionResponse.from(s, currentSessionId))
                .toList();
    }

    @Transactional
    public void revokeSession(Long userId, UUID sessionId) {
        AuthSession session = sessions.findWithUserById(sessionId)
                .filter(s -> s.getUser().getId().equals(userId))
                // 404 rather than 403 so session ids of other users cannot be probed.
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "session_not_found", "Session not found"));
        sessions.revoke(session.getId(), RevokeReason.REVOKED_BY_USER, clock.instant());
    }

    @Transactional(noRollbackFor = ApiException.class)
    public ChangePasswordResponse changePassword(Long userId, UUID currentSessionId, ChangePasswordRequest request) {
        Instant now = clock.instant();
        User user = users.findById(userId).orElseThrow(() -> unauthorized(AuthErrorCodes.INVALID_TOKEN, "Unknown user"));
        if (user.isLockedAt(now)) {
            throw locked(user.getLockedUntil(), now);
        }
        // Counts towards lock-out: a stolen access token must not become a password-guessing oracle.
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            Instant lockUntil = now.plus(props.login().lockDuration());
            if (user.registerFailedLogin(props.login().maxFailedAttempts(), lockUntil)) {
                throw locked(lockUntil, now);
            }
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_current_password", "Current password is incorrect");
        }
        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "password_reuse", "New password must differ from the current one");
        }
        user.registerSuccessfulLogin();
        user.changePassword(passwordEncoder.encode(request.newPassword()), now);
        int revoked = sessions.revokeAllForUserExcept(userId, currentSessionId, RevokeReason.PASSWORD_CHANGED, now);
        log.info("Password changed userId={} otherSessionsRevoked={}", userId, revoked);
        return new ChangePasswordResponse("Password changed; all other sessions were signed out", revoked);
    }

    private TokenResponse issueTokens(User user, AuthSession session, Instant now) {
        String rawRefresh = tokenService.newRefreshTokenValue();
        Instant refreshExpiresAt = min(now.plus(props.session().refreshTokenTtl()), session.getExpiresAt());
        refreshTokens.save(new RefreshToken(session, TokenService.hash(rawRefresh), now, refreshExpiresAt));

        IssuedAccessToken access = tokenService.issueAccessToken(user, session, now);
        return new TokenResponse("Bearer", access.value(), access.expiresAt(),
                Duration.between(now, access.expiresAt()).toSeconds(),
                rawRefresh, refreshExpiresAt, session.getId());
    }

    /** Oldest sessions are signed out first when a new login would exceed the per-user cap. */
    private void enforceSessionLimit(Long userId, Instant now) {
        List<AuthSession> active = sessions.findActiveByUserId(userId, now);
        int excess = active.size() - props.session().maxActivePerUser() + 1;
        for (int i = 0; i < excess; i++) {
            sessions.revoke(active.get(i).getId(), RevokeReason.SESSION_LIMIT, now);
        }
    }

    private ApiException revokeForReuse(AuthSession session, User user) {
        sessions.revoke(session.getId(), RevokeReason.REFRESH_TOKEN_REUSE, clock.instant());
        log.warn("SECURITY refresh token reuse detected; session revoked userId={} sessionId={}",
                user.getId(), session.getId());
        return unauthorized(AuthErrorCodes.REFRESH_TOKEN_REUSED,
                "Refresh token was already used. The session has been revoked as a precaution; log in again");
    }

    private static Instant min(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }

    private static String normalizeEmail(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }

    private static ApiException invalidCredentials() {
        return unauthorized(AuthErrorCodes.INVALID_CREDENTIALS, "Invalid email or password");
    }

    private static ApiException emailTaken() {
        return new ApiException(HttpStatus.CONFLICT, "email_taken", "An account with this email already exists");
    }

    private static ApiException locked(Instant until, Instant now) {
        long seconds = Math.max(1, Duration.between(now, until).toSeconds());
        return new ApiException(HttpStatus.LOCKED, AuthErrorCodes.ACCOUNT_LOCKED,
                "Too many failed attempts. Account locked until " + until, seconds);
    }

    private static ApiException unauthorized(String code, String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, code, message);
    }
}
