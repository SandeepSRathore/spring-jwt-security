package com.learning.jwtauth.auth;

import java.util.List;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.learning.jwtauth.auth.AuthDtos.ChangePasswordRequest;
import com.learning.jwtauth.auth.AuthDtos.ChangePasswordResponse;
import com.learning.jwtauth.auth.AuthDtos.ClientInfo;
import com.learning.jwtauth.auth.AuthDtos.LoginRequest;
import com.learning.jwtauth.auth.AuthDtos.LogoutAllResponse;
import com.learning.jwtauth.auth.AuthDtos.RefreshRequest;
import com.learning.jwtauth.auth.AuthDtos.RegisterRequest;
import com.learning.jwtauth.auth.AuthDtos.SessionResponse;
import com.learning.jwtauth.auth.AuthDtos.TokenResponse;
import com.learning.jwtauth.auth.AuthDtos.UserResponse;
import com.learning.jwtauth.common.ApiException;
import com.learning.jwtauth.security.AccessTokenValidator;
import com.learning.jwtauth.security.AuthErrorCodes;
import com.learning.jwtauth.security.LoginRateLimiter;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final LoginRateLimiter loginRateLimiter;

    public AuthController(AuthService authService, LoginRateLimiter loginRateLimiter) {
        this.authService = authService;
        this.loginRateLimiter = loginRateLimiter;
    }

    @PostMapping("/register")
    ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request));
    }

    @PostMapping("/login")
    ResponseEntity<TokenResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        ClientInfo client = clientInfo(http);
        long retryAfter = loginRateLimiter.tryAcquire(client.ipAddress());
        if (retryAfter > 0) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, AuthErrorCodes.TOO_MANY_REQUESTS,
                    "Too many login attempts from this client; slow down", retryAfter);
        }
        return noStore(authService.login(request, client));
    }

    @PostMapping("/refresh")
    ResponseEntity<TokenResponse> refresh(@Valid @RequestBody RefreshRequest request) {
        return noStore(authService.refresh(request.refreshToken()));
    }

    /** Takes the refresh token rather than the access token so it still works after the access token expired. */
    @PostMapping("/logout")
    ResponseEntity<Void> logout(@Valid @RequestBody RefreshRequest request) {
        authService.logout(request.refreshToken());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout-all")
    LogoutAllResponse logoutAll(@AuthenticationPrincipal Jwt jwt) {
        return new LogoutAllResponse(authService.logoutAll(userId(jwt)));
    }

    @GetMapping("/sessions")
    List<SessionResponse> sessions(@AuthenticationPrincipal Jwt jwt) {
        return authService.activeSessions(userId(jwt), sessionId(jwt));
    }

    @DeleteMapping("/sessions/{sessionId}")
    ResponseEntity<Void> revokeSession(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID sessionId) {
        authService.revokeSession(userId(jwt), sessionId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/change-password")
    ChangePasswordResponse changePassword(@AuthenticationPrincipal Jwt jwt,
                                          @Valid @RequestBody ChangePasswordRequest request) {
        return authService.changePassword(userId(jwt), sessionId(jwt), request);
    }

    static Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }

    static UUID sessionId(Jwt jwt) {
        return UUID.fromString(jwt.getClaimAsString(AccessTokenValidator.SESSION_CLAIM));
    }

    /**
     * Uses the socket address, not X-Forwarded-For, which any client can forge. Behind a trusted
     * proxy set server.forward-headers-strategy=native so getRemoteAddr() reflects the real client.
     */
    private static ClientInfo clientInfo(HttpServletRequest http) {
        String userAgent = http.getHeader(HttpHeaders.USER_AGENT);
        if (userAgent != null && userAgent.length() > 512) {
            userAgent = userAgent.substring(0, 512);
        }
        return new ClientInfo(http.getRemoteAddr(), userAgent);
    }

    private static ResponseEntity<TokenResponse> noStore(TokenResponse body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").header("Pragma", "no-cache").body(body);
    }
}
