package com.learning.jwtauth.auth;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.learning.jwtauth.session.AuthSession;
import com.learning.jwtauth.user.User;

public final class AuthDtos {

    // BCrypt only looks at the first 72 bytes, so cap length well below that.
    private static final String PASSWORD_RULE = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,64}$";
    private static final String PASSWORD_MESSAGE =
            "must be 8-64 characters with an upper-case letter, a lower-case letter, a digit and a symbol";

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Pattern(regexp = PASSWORD_RULE, message = PASSWORD_MESSAGE) String password) {
    }

    // No password rules here: login must not reveal the policy or reject legacy passwords.
    public record LoginRequest(@NotBlank @Size(max = 254) String email, @NotBlank @Size(max = 128) String password) {
    }

    public record RefreshRequest(@NotBlank @Size(max = 128) String refreshToken) {
    }

    public record ChangePasswordRequest(
            @NotBlank @Size(max = 128) String currentPassword,
            @NotBlank @Pattern(regexp = PASSWORD_RULE, message = PASSWORD_MESSAGE) String newPassword) {
    }

    public record TokenResponse(String tokenType, String accessToken, Instant accessTokenExpiresAt, long expiresIn,
                                String refreshToken, Instant refreshTokenExpiresAt, UUID sessionId) {
    }

    public record UserResponse(Long id, String email, String name, List<String> roles, Instant createdAt) {

        public static UserResponse from(User user) {
            return new UserResponse(user.getId(), user.getEmail(), user.getName(),
                    user.getRoles().stream().map(Enum::name).sorted().toList(), user.getCreatedAt());
        }
    }

    public record SessionResponse(UUID id, Instant createdAt, Instant lastUsedAt, Instant expiresAt,
                                  String ipAddress, String userAgent, boolean current) {

        public static SessionResponse from(AuthSession s, UUID currentSessionId) {
            return new SessionResponse(s.getId(), s.getCreatedAt(), s.getLastUsedAt(), s.getExpiresAt(),
                    s.getIpAddress(), s.getUserAgent(), s.getId().equals(currentSessionId));
        }
    }

    public record ChangePasswordResponse(String message, int otherSessionsRevoked) {
    }

    public record LogoutAllResponse(int sessionsRevoked) {
    }

    public record ClientInfo(String ipAddress, String userAgent) {
    }
}
