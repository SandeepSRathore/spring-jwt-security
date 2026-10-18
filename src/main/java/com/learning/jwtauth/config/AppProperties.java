package com.learning.jwtauth.config;

import java.time.Duration;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "app")
public record AppProperties(@Valid Jwt jwt, @Valid Session session, @Valid Login login, @Valid Admin admin) {

    public record Jwt(@NotBlank String secret, @NotBlank String issuer, @NotBlank String audience,
                      @NotNull Duration accessTokenTtl, @NotNull Duration clockSkew) {
    }

    public record Session(@NotNull Duration refreshTokenTtl, @NotNull Duration absoluteTtl,
                          @Min(1) int maxActivePerUser) {
    }

    public record Login(@Min(1) int maxFailedAttempts, @NotNull Duration lockDuration,
                        @Min(1) int rateLimitPerMinute) {
    }

    public record Admin(@NotBlank String email, @NotBlank String password) {
    }
}
