package com.learning.jwtauth.user;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.learning.jwtauth.auth.AuthDtos.UserResponse;
import com.learning.jwtauth.common.ApiException;

@RestController
public class UserController {

    private final UserRepository users;

    public UserController(UserRepository users) {
        this.users = users;
    }

    @GetMapping("/api/public/ping")
    Map<String, String> ping() {
        return Map.of("status", "ok");
    }

    @GetMapping("/api/users/me")
    UserResponse me(@AuthenticationPrincipal Jwt jwt) {
        return users.findById(Long.valueOf(jwt.getSubject()))
                .map(UserResponse::from)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "user_not_found", "User not found"));
    }

    /** Shows what the server sees inside the access token; handy while learning. */
    @GetMapping("/api/users/me/token")
    Map<String, Object> tokenClaims(@AuthenticationPrincipal Jwt jwt) {
        return Map.of("headers", jwt.getHeaders(), "claims", jwt.getClaims());
    }
}
