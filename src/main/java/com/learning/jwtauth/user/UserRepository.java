package com.learning.jwtauth.user;

import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    /*
     * The *ForUpdate variants take a pessimistic row lock (SELECT ... FOR UPDATE) so that two
     * concurrent requests that both read, increment and write failedLoginAttempts can't
     * interleave. Without the lock, several simultaneous wrong-password attempts could each read
     * the same count and undercount it, letting an attacker exceed the limit before lock-out
     * trips. The lock serialises login/change-password accounting per account; it is released
     * when the surrounding transaction commits.
     */

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.email = :email")
    Optional<User> findByEmailForUpdate(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> findByIdForUpdate(@Param("id") Long id);
}
