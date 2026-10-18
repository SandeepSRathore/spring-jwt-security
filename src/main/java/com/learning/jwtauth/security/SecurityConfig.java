package com.learning.jwtauth.security;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    /** Endpoints that must work without (or with an expired) access token. */
    private static final List<String> PUBLIC_AUTH_ENDPOINTS = List.of(
            "/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout");

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JsonAuthErrorHandler authErrorHandler)
            throws Exception {
        http
                // Tokens travel in the Authorization header, never in cookies, so there is no
                // ambient credential for CSRF to abuse.
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, PUBLIC_AUTH_ENDPOINTS.toArray(String[]::new)).permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/public/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint(authErrorHandler)
                        .accessDeniedHandler(authErrorHandler))
                .oauth2ResourceServer(rs -> rs
                        .bearerTokenResolver(bearerTokenResolver())
                        .authenticationEntryPoint(authErrorHandler)
                        .accessDeniedHandler(authErrorHandler)
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));
        return http.build();
    }

    /**
     * Ignores the Authorization header on the public auth endpoints, so a client that still
     * attaches its expired access token can call /refresh or /logout instead of getting a 401.
     * Also refuses tokens in query parameters (they leak into logs and browser history).
     */
    private static BearerTokenResolver bearerTokenResolver() {
        DefaultBearerTokenResolver delegate = new DefaultBearerTokenResolver();
        delegate.setAllowUriQueryParameter(false);
        delegate.setAllowFormEncodedBodyParameter(false);
        return request -> PUBLIC_AUTH_ENDPOINTS.contains(request.getRequestURI()) ? null : delegate.resolve(request);
    }

    private static JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("roles");
        authorities.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        // Delegating encoder ("{bcrypt}..." prefix) lets us upgrade hashing algorithms later.
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
