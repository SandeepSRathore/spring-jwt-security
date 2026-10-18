package com.learning.jwtauth.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import com.learning.jwtauth.config.AppProperties;
import com.learning.jwtauth.session.AuthSession;
import com.learning.jwtauth.user.User;

@Service
public class TokenService {

    public record IssuedAccessToken(String value, Instant expiresAt) {
    }

    private final JwtEncoder encoder;
    private final AppProperties props;
    private final SecureRandom random = new SecureRandom();

    public TokenService(JwtEncoder encoder, AppProperties props) {
        this.encoder = encoder;
        this.props = props;
    }

    public IssuedAccessToken issueAccessToken(User user, AuthSession session, Instant now) {
        Instant expiresAt = now.plus(props.jwt().accessTokenTtl());
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).type(JwtConfig.ACCESS_TOKEN_TYPE).build();
        // Deliberately small: no password hash, no PII beyond the email the client already knows.
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(props.jwt().issuer())
                .audience(List.of(props.jwt().audience()))
                .subject(user.getId().toString())
                .issuedAt(now)
                .notBefore(now)
                .expiresAt(expiresAt)
                .id(UUID.randomUUID().toString())
                .claim(AccessTokenValidator.SESSION_CLAIM, session.getId().toString())
                .claim("email", user.getEmail())
                .claim("roles", user.getRoles().stream().map(Enum::name).sorted().toList())
                .build();
        String value = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new IssuedAccessToken(value, expiresAt);
    }

    /** 256 bits from a CSPRNG: an opaque handle, not a JWT, so it cannot be decoded or forged. */
    public String newRefreshTokenValue() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String hash(String refreshToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(refreshToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
