package com.learning.jwtauth.admin;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.learning.jwtauth.common.ApiException;
import com.learning.jwtauth.session.AuthSessionRepository;
import com.learning.jwtauth.session.RevokeReason;
import com.learning.jwtauth.user.User;
import com.learning.jwtauth.user.UserRepository;

/** Only reachable with ROLE_ADMIN (see SecurityConfig). */
@RestController
@RequestMapping("/api/admin/users")
public class AdminController {

    public record AdminUserResponse(Long id, String email, String name, List<String> roles, boolean enabled,
                                    boolean locked, Instant lockedUntil, int failedLoginAttempts,
                                    long activeSessions) {
    }

    private final UserRepository users;
    private final AuthSessionRepository sessions;
    private final Clock clock;

    public AdminController(UserRepository users, AuthSessionRepository sessions, Clock clock) {
        this.users = users;
        this.sessions = sessions;
        this.clock = clock;
    }

    @GetMapping
    @Transactional(readOnly = true)
    List<AdminUserResponse> list() {
        return users.findAll().stream().map(this::toResponse).toList();
    }

    /** Disabling revokes every session, so the user's existing access tokens die on their next request. */
    @PostMapping("/{id}/disable")
    @Transactional
    AdminUserResponse disable(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        if (id.toString().equals(jwt.getSubject())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "cannot_disable_self", "Admins cannot disable themselves");
        }
        User user = find(id);
        user.setEnabled(false);
        sessions.revokeAllForUser(id, RevokeReason.ACCOUNT_DISABLED, clock.instant());
        return toResponse(find(id));
    }

    @PostMapping("/{id}/enable")
    @Transactional
    AdminUserResponse enable(@PathVariable Long id) {
        User user = find(id);
        user.setEnabled(true);
        return toResponse(user);
    }

    @PostMapping("/{id}/unlock")
    @Transactional
    AdminUserResponse unlock(@PathVariable Long id) {
        User user = find(id);
        user.unlock();
        return toResponse(user);
    }

    private User find(Long id) {
        return users.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "user_not_found", "User not found"));
    }

    private AdminUserResponse toResponse(User u) {
        Instant now = clock.instant();
        return new AdminUserResponse(u.getId(), u.getEmail(), u.getName(),
                u.getRoles().stream().map(Enum::name).sorted().toList(), u.isEnabled(), u.isLockedAt(now),
                u.isLockedAt(now) ? u.getLockedUntil() : null, u.getFailedLoginAttempts(),
                sessions.countActiveByUserId(u.getId(), now));
    }
}
