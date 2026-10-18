package com.learning.jwtauth.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.learning.jwtauth.config.AppProperties;

/**
 * Sliding-window limiter per client IP for /login. Account lock-out stops guessing against one
 * account; this stops one client spraying passwords across many accounts. In-memory, so it is
 * per-instance; behind a load balancer use a shared store (Redis) or the gateway's limiter.
 */
@Component
public class LoginRateLimiter {

    private static final Duration WINDOW = Duration.ofMinutes(1);

    private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();
    private final Clock clock;
    private final int limit;

    public LoginRateLimiter(Clock clock, AppProperties props) {
        this.clock = clock;
        this.limit = props.login().rateLimitPerMinute();
    }

    /** Records an attempt and returns 0 if allowed, otherwise the seconds until the next slot frees up. */
    public long tryAcquire(String clientKey) {
        Instant now = clock.instant();
        Instant windowStart = now.minus(WINDOW);
        long[] retryAfter = {0};
        attempts.compute(clientKey, (key, deque) -> {
            Deque<Instant> d = deque == null ? new ArrayDeque<>() : deque;
            while (!d.isEmpty() && !d.peekFirst().isAfter(windowStart)) {
                d.pollFirst();
            }
            if (d.size() >= limit) {
                retryAfter[0] = Math.max(1, Duration.between(windowStart, d.peekFirst()).toSeconds() + 1);
            } else {
                d.addLast(now);
            }
            return d;
        });
        return retryAfter[0];
    }
}
