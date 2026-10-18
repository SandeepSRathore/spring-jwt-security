package com.learning.jwtauth.session;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    @Query("""
            select t from RefreshToken t join fetch t.session s join fetch s.user
            where t.tokenHash = :hash""")
    Optional<RefreshToken> findWithSessionByTokenHash(@Param("hash") String hash);

    /**
     * Atomically claims the token for rotation. Two concurrent refreshes with the same token
     * race on this row; exactly one sees 1, the loser sees 0 and is treated as a replay.
     */
    @Modifying(flushAutomatically = true)
    @Query("update RefreshToken t set t.usedAt = :now where t.id = :id and t.usedAt is null")
    int markUsed(@Param("id") Long id, @Param("now") Instant now);
}
