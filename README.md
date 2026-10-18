# spring-jwt-security

A JWT authentication system in one repo: a Spring Boot API and an Angular client that drives it.

| Part | Path | Stack | README |
|---|---|---|---|
| Backend API | `./` (root, `src/`, `pom.xml`) | Spring Boot 4.1, Spring Security 7, Java 25 | [below](#backend) |
| Frontend client | `frontend/` | Angular 22 | [frontend/README.md](frontend/README.md) |

## Run both

Two terminals, from this directory:

```bash
# 1. the API  → http://localhost:8080
mvn spring-boot:run

# 2. the UI   → http://localhost:4200
cd frontend
npm install        # first time only
npm start
```

Open http://localhost:4200 and sign in with the seeded admin `admin@example.com` /
`Admin@12345` (there's a **Fill in admin** link on the sign-in page), or create an account.
The UI calls the API through a dev proxy, so no CORS setup is needed.

To watch tokens expire in seconds rather than minutes, start the API with the short-lifetime
profile: `mvn spring-boot:run -Dspring-boot.run.profiles=curltest`.

---

# Backend

An API-only Spring Boot app. It uses Spring Security 7 and JWT access tokens, with rotating
refresh tokens backed by server-side sessions.

## Run it

```bash
# normal lifetimes (access 15m, refresh 7d, session max 30d)
mvn spring-boot:run

# short lifetimes for testing expiry (access 15s, refresh 40s, lock-out 30s, 3 sessions max)
mvn spring-boot:run -Dspring-boot.run.profiles=curltest
./test-api.sh
```

The database is H2 in-memory, so every restart starts clean. A bootstrap admin is created from
`ADMIN_EMAIL` / `ADMIN_PASSWORD`, which default to `admin@example.com` / `Admin@12345`. Set
`JWT_SECRET` to your own key (`openssl rand -base64 48`) for anything that isn't local testing.

## How it works

```
POST /login ──► AuthSession row (id = "sid")      one row per device/login
                 ├─ RefreshToken rows (SHA-256 hashed, single use, rotated on every /refresh)
                 └─ access JWT (15 min) carries sid, signed HS256, typ=at+jwt

Every request with a Bearer token:
  signature (HS256 only) → typ=at+jwt → iss → aud → exp/nbf → session active? → user enabled?
```

Access tokens are short-lived JWTs. Refresh tokens are 256-bit random strings, not JWTs, and the
server keeps only their hashes. Every access token is tied to a server-side session through its
`sid` claim. Revoking that session (logout, password change, a detected theft, the session
limit, or an admin disabling the account) kills both the refresh token and every access token
minted from that session. They stop working on their next request, not when they would have
expired. This costs one primary-key database lookup per authenticated request. See the
trade-offs section.

## Use cases covered

| Use case / threat | How it is handled | Test section |
|---|---|---|
| Register | BCrypt (delegating encoder), password policy, email normalised (trim + lower-case), 409 on duplicate | 1 |
| Login | Generic `invalid_credentials` for unknown email and wrong password. A dummy hash check keeps response timing the same either way | 2 |
| Access token expiry | 15 min TTL, `401 token_expired` tells the client to call `/refresh` | 16 |
| Refresh token expiry | 7 days, sliding (each rotation issues a fresh 7 days), never beyond the session's 30-day absolute cap | 16 |
| Refresh token rotation | Every `/refresh` consumes the token and returns a new pair | 5 |
| **Stolen refresh token** | Reuse detection: presenting an already-used token revokes the whole session, so the thief's and the victim's tokens both die. `401 refresh_token_reused` | 6 |
| Concurrent refresh race | An atomic `UPDATE … WHERE used_at IS NULL` lets exactly one request win. The other counts as reuse | 7 |
| **Stolen access token** | Short TTL, and instant death on logout, password change, logout-all, admin disable or theft detection, via the `sid` check | 6, 8, 12, 13, 15 |
| Tampered payload / `alg:none` / wrong key | Signature pinned to HS256 → `401 invalid_token` | 4 |
| Token from another system / token confusion | `typ` must be `at+jwt`, plus `iss` and `aud` checks. Refresh tokens are not JWTs | 4, 5 |
| Forged token with leaked key | `sid` must exist, be active, and belong to `sub`. Limits damage, but rotate the key | 4 |
| Logout | `POST /logout` with the refresh token. Works even after the access token expired, and is idempotent | 8 |
| Logout everywhere | `POST /logout-all` | 12 |
| See / kill other devices | `GET /sessions` (IP, user agent, current flag), `DELETE /sessions/{id}` | 9 |
| Too many devices | Max active sessions per user. The oldest is signed out | 11 |
| Change password | Requires the current password. Signs out every other session and keeps the current one | 13 |
| Brute force on one account | Lock-out after N failures (`423 account_locked` + `Retry-After`). Auto-unlocks, or an admin can unlock | 14 |
| Password spraying across accounts | Per-IP sliding-window rate limit on `/login` (`429` + `Retry-After`) | 17 |
| Disabled account | Login → `403 account_disabled` (only after a correct password). Existing tokens die at once | 15 |
| Role-based access | `ROLE_ADMIN` on `/api/admin/**` → `403 access_denied` for users | 3, 10 |
| Token leakage | Bearer header only (query-string and form tokens refused), `Cache-Control: no-store` on token responses, no cookies so no CSRF surface | 2, 3 |

## Endpoints

| Method | Path | Auth | Body |
|---|---|---|---|
| GET | `/api/public/ping` | – | – |
| POST | `/api/auth/register` | – | `{email, name, password}` |
| POST | `/api/auth/login` | – | `{email, password}` |
| POST | `/api/auth/refresh` | – | `{refreshToken}` |
| POST | `/api/auth/logout` | – | `{refreshToken}` |
| POST | `/api/auth/logout-all` | Bearer | – |
| GET | `/api/auth/sessions` | Bearer | – |
| DELETE | `/api/auth/sessions/{id}` | Bearer | – |
| POST | `/api/auth/change-password` | Bearer | `{currentPassword, newPassword}` |
| GET | `/api/users/me` | Bearer | – |
| GET | `/api/users/me/token` | Bearer | – (shows decoded header + claims) |
| GET | `/api/admin/users` | ADMIN | – |
| POST | `/api/admin/users/{id}/disable` \| `/enable` \| `/unlock` | ADMIN | – |

Password policy: 8–64 characters, with at least one upper-case letter, one lower-case letter, one digit and one symbol.

## Error codes (what a client should do)

Every error body looks like `{"timestamp","status","error","message","path"}`. Branch on `error`:

| status | error | client action |
|---|---|---|
| 401 | `missing_token` | attach `Authorization: Bearer …` |
| 401 | `token_expired` | call `/refresh`, retry the request once |
| 401 | `invalid_token` | discard tokens, log in |
| 401 | `session_revoked` / `session_expired` | discard tokens, log in |
| 401 | `account_disabled` | discard tokens, show message |
| 401 | `refresh_token_expired` / `refresh_token_reused` / `invalid_refresh_token` | discard tokens, log in |
| 401 | `invalid_credentials` | show "invalid email or password" |
| 403 | `access_denied` | user lacks the role |
| 403 | `account_disabled` | (login) show message |
| 423 | `account_locked` | wait `Retry-After` seconds |
| 429 | `too_many_requests` | wait `Retry-After` seconds |
| 400 | `validation_failed` (+ `fieldErrors`) / `malformed_request` / `invalid_current_password` / `password_reuse` | fix input |
| 409 | `email_taken` | – |

## Automated suite

`./test-api.sh` runs 124 checks against a running server and exits non-zero on any failure. It
covers everything above, plus forged tokens signed with the real key: wrong `typ`, `iss`, `aud`,
`sid`, `sub`, `exp` and `nbf`. A positive control proves the forging helper itself is correct. It
also covers the parallel-refresh race and the per-IP rate limit. Run it against the `curltest`
profile. It takes about 70s because it waits for real expiry. The rate-limit section blocks
logins from your IP for a minute, so leave a minute between runs. If you start the server with a
custom `JWT_SECRET`, export the same value for the script.

A copy-paste curl walkthrough for each scenario lives in [`test-api.sh`](test-api.sh)'s comments
and the manual steps are also in the git history of this README.

## Trade-offs and production notes

- **Per-request session lookup.** This is what makes logout and theft response instant. At high
  volume, cache session status for a few seconds (Caffeine or Redis) and accept that much
  revocation lag. A fully stateless alternative is a very short access TTL plus a denylist of
  `jti` values.
- **HS256 (shared secret).** This is fine when the same service issues and verifies tokens. If
  other services verify the tokens, switch to RS256 or ES256 (`NimbusJwtEncoder.withKeyPair`)
  and publish a JWKS. Then only the issuer holds the private key.
- **Strict reuse detection, no grace period.** A client that fires two refreshes in parallel
  gets logged out. Clients should serialise refreshes (the Angular app does: one in-flight
  refresh is shared).
- **Browser clients.** Keep the refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie
  scoped to `/api/auth`, and keep the access token in memory only. This API returns both in JSON
  because it targets API, mobile, and the test UI. A cookie-based variant would also need CSRF
  protection on `/refresh` and `/logout`.
- **Rate limiter and lock-out state.** The rate limiter is in-memory and per instance, so use
  Redis or the API gateway when running several instances. Lock-out state lives in the database,
  so it is already shared. Behind a proxy, set `server.forward-headers-strategy=native` so the
  client IP is real; `X-Forwarded-For` is deliberately not trusted.
- **Account enumeration.** `409 email_taken` on register and `423 account_locked` on login do
  reveal that an account exists. Login itself does not.
- **Not included (they need email delivery):** email verification, forgot-password / reset
  tokens, MFA.
- Use a real database (Postgres) with Flyway in place of `ddl-auto`. Add a scheduled job to
  purge expired sessions and refresh tokens, and serve only over HTTPS.
