package com.learning.jwtauth.security;

import java.io.IOException;
import java.util.Collection;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import com.learning.jwtauth.common.ErrorResponse;

import tools.jackson.databind.json.JsonMapper;

/**
 * Turns Spring Security failures into the same JSON shape as the rest of the API, plus the
 * RFC 6750 WWW-Authenticate header.
 */
@Component
public class JsonAuthErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final JsonMapper jsonMapper;

    public JsonAuthErrorHandler(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        OAuth2Error error = resolveError(authException);
        if (error == null) {
            response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
            write(response, request, 401, AuthErrorCodes.MISSING_TOKEN, "Authentication required: send 'Authorization: Bearer <access token>'");
            return;
        }
        String description = error.getDescription() == null ? "Invalid access token" : error.getDescription();
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE,
                "Bearer error=\"invalid_token\", error_description=\"" + description.replace("\"", "'") + "\"");
        write(response, request, 401, error.getErrorCode(), description);
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer error=\"insufficient_scope\"");
        write(response, request, 403, AuthErrorCodes.ACCESS_DENIED, "You do not have permission to access this resource");
    }

    /**
     * Prefers the specific error our validators produced (token_expired, session_revoked, ...)
     * over the generic invalid_token that the bearer-token provider wraps it in.
     */
    private static OAuth2Error resolveError(AuthenticationException ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof JwtValidationException jve) {
                Collection<OAuth2Error> errors = jve.getErrors();
                if (!errors.isEmpty()) {
                    return errors.iterator().next();
                }
            }
        }
        if (ex instanceof OAuth2AuthenticationException oae) {
            // Signature failures, malformed tokens, unsupported algorithms: keep details vague.
            return new OAuth2Error(AuthErrorCodes.INVALID_TOKEN, "Access token is malformed or its signature is invalid", null);
        }
        return null;
    }

    private void write(HttpServletResponse response, HttpServletRequest request, int status, String code,
                       String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        jsonMapper.writeValue(response.getOutputStream(),
                ErrorResponse.of(status, code, message, request.getRequestURI()));
    }
}
