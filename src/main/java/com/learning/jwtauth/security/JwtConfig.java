package com.learning.jwtauth.security;

import java.time.Clock;
import java.util.Base64;
import java.util.List;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtAudienceValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTypeValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.learning.jwtauth.config.AppProperties;

@Configuration
public class JwtConfig {

    /** RFC 9068 media type for access tokens; stops other JWTs signed with our key being replayed as one. */
    public static final String ACCESS_TOKEN_TYPE = "at+jwt";

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    SecretKey jwtSigningKey(AppProperties props) {
        byte[] bytes = Base64.getDecoder().decode(props.jwt().secret());
        if (bytes.length < 32) {
            throw new IllegalStateException("app.jwt.secret must decode to at least 32 bytes for HS256");
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) {
        return NimbusJwtEncoder.withSecretKey(key).algorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key, AppProperties props, AccessTokenValidator accessTokenValidator) {
        // Pinning HS256 means "alg":"none" and algorithm-substitution tokens fail signature checks.
        // validateType(false) hands the "typ" check to JwtTypeValidator below so we can require at+jwt.
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .validateType(false)
                .build();
        decoder.setJwtValidator(firstFailure(List.of(
                new JwtTypeValidator(ACCESS_TOKEN_TYPE),
                new JwtIssuerValidator(props.jwt().issuer()),
                new JwtAudienceValidator(props.jwt().audience()),
                accessTokenValidator)));
        return decoder;
    }

    /**
     * Unlike DelegatingOAuth2TokenValidator this stops at the first failure, so a token with
     * the wrong issuer or an expired token never costs a database lookup in AccessTokenValidator.
     */
    private static OAuth2TokenValidator<Jwt> firstFailure(List<OAuth2TokenValidator<Jwt>> validators) {
        return jwt -> {
            for (OAuth2TokenValidator<Jwt> validator : validators) {
                OAuth2TokenValidatorResult result = validator.validate(jwt);
                if (result.hasErrors()) {
                    return result;
                }
            }
            return OAuth2TokenValidatorResult.success();
        };
    }
}
