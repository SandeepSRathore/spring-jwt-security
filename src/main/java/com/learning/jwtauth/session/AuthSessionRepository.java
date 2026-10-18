package com.learning.jwtauth.session;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthSessionRepository extends JpaRepository<AuthSession, UUID> {

    @Query("select s from AuthSession s join fetch s.user where s.id = :id")
    Optional<AuthSession> findWithUserById(@Param("id") UUID id);

    @Query("""
            select s from AuthSession s
            where s.user.id = :userId and s.revokedAt is null and s.expiresAt > :now
            order by s.createdAt asc""")
    List<AuthSession> findActiveByUserId(@Param("userId") Long userId, @Param("now") Instant now);

    @Query("""
            select count(s) from AuthSession s
            where s.user.id = :userId and s.revokedAt is null and s.expiresAt > :now""")
    long countActiveByUserId(@Param("userId") Long userId, @Param("now") Instant now);

    // Bulk updates: guarded by "revokedAt is null" so the first reason recorded wins.

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update AuthSession s set s.revokedAt = :now, s.revokeReason = :reason
            where s.id = :id and s.revokedAt is null""")
    int revoke(@Param("id") UUID id, @Param("reason") RevokeReason reason, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update AuthSession s set s.revokedAt = :now, s.revokeReason = :reason
            where s.user.id = :userId and s.revokedAt is null""")
    int revokeAllForUser(@Param("userId") Long userId, @Param("reason") RevokeReason reason,
                         @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update AuthSession s set s.revokedAt = :now, s.revokeReason = :reason
            where s.user.id = :userId and s.id <> :keepId and s.revokedAt is null""")
    int revokeAllForUserExcept(@Param("userId") Long userId, @Param("keepId") UUID keepId,
                               @Param("reason") RevokeReason reason, @Param("now") Instant now);
}
