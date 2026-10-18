package com.learning.jwtauth.session;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.learning.jwtauth.user.User;

/**
 * One login on one device. Every access token carries this id as its "sid" claim and every
 * refresh token belongs to exactly one session, so revoking the session instantly kills both
 * the refresh-token family and all access tokens minted from it.
 */
@Entity
@Table(name = "auth_sessions")
public class AuthSession {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant lastUsedAt;

    @Column(nullable = false)
    private Instant expiresAt;

    private Instant revokedAt;

    @Enumerated(EnumType.STRING)
    private RevokeReason revokeReason;

    private String ipAddress;

    @Column(length = 512)
    private String userAgent;

    protected AuthSession() {
    }

    public AuthSession(User user, Instant now, Instant expiresAt, String ipAddress, String userAgent) {
        this.id = UUID.randomUUID();
        this.user = user;
        this.createdAt = now;
        this.lastUsedAt = now;
        this.expiresAt = expiresAt;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
    }

    public boolean isActiveAt(Instant now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }

    public UUID getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }

    public void touch(Instant now) {
        this.lastUsedAt = now;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public RevokeReason getRevokeReason() {
        return revokeReason;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public String getUserAgent() {
        return userAgent;
    }
}
