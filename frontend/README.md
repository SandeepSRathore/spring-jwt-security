# Token bench — Angular client

An Angular 22 UI for the JWT auth API in the parent project. It's a test console: a fixed
inspector panel on the right shows the live access token (decoded, with a lifetime countdown),
the refresh token, and a log of every request the app makes — so you can watch what each
action does to your tokens.

## Run it

Two terminals, from the project root (`spring-jwt-security`):

```bash
# 1. the API
mvn spring-boot:run

# 2. this app
cd frontend
npm start            # http://localhost:4200
```

`npm start` runs `ng serve` with a dev proxy (`proxy.conf.json`): the app calls `/api/...` on
its own origin and the proxy forwards to `http://localhost:8080`, so there's no CORS setup and
the backend needs no cross-origin config. Sign in with the seeded admin — `admin@example.com`
/ `Admin@12345` (the **Fill in admin** link on the sign-in page does this) — or create an
account.

Want to watch tokens expire quickly? Start the API with the short-lifetime profile
(`mvn spring-boot:run -Dspring-boot.run.profiles=curltest`): the access token lasts 15s, so the
countdown in the panel turns amber and then stamps **Expired**, and you can see the app
auto-refresh (or, if you untick auto-refresh, get a `token_expired` and recover with the
**Refresh token** button).

## What each page shows

- **Sign in / Create account** — register (with the same password policy the server enforces,
  checked client-side first) and log in. When a session ends, this page explains why with the
  server's own error code (`refresh_token_reused`, `session_revoked`, `account_disabled`, …).
- **Account** — your profile from `GET /api/users/me`, a **Refresh token** button that rotates
  the refresh token on demand, and **Change password** (which signs out your other devices).
- **Devices** — every active session from `GET /api/auth/sessions`, with the current one
  marked. Revoke any one, or **Sign out everywhere**. A revoked session's tokens die on their
  next request.
- **Users** (admin only) — all accounts, with disable / enable / unlock. The link only appears
  when your token carries `ROLE_ADMIN`; the server enforces it regardless of what the UI shows.

## How the security pieces map to code

- **Access token in memory only; refresh token in `sessionStorage`.** `core/token-store.ts`.
  A reload restores the session by trading the stored refresh token for a new access token
  (`AuthService.restore`, wired through `provideAppInitializer`).
- **Bearer header, auto-refresh, and sign-out on a dead session.** `core/interceptors.ts`.
  On `401 token_expired` it refreshes once and retries; on `session_revoked` /
  `session_expired` / `account_disabled` it ends the session and routes to sign-in.
- **Single-flight refresh.** `AuthService.refresh` shares one in-flight request. The server
  treats a second use of a refresh token as theft and revokes the whole session, so the app
  must never fire two refreshes with the same token at once.
- **Route guards.** `core/guards.ts` — `signedIn`, `signedOut`, and a UI-only `admin` guard.
- **Forms.** Signal Forms (`@angular/forms/signals`) for sign-in, register and change-password.

The token drawing and request log are view-only helpers in `rail/`. The client never verifies
a token — it only decodes it for display (`core/jwt.ts`); verification is the server's job.

## Production notes

This app keeps the refresh token in `sessionStorage` so it's easy to inspect while testing. A
real browser client is safer with the refresh token in an `HttpOnly; Secure; SameSite` cookie
that scripts can't read, with the access token still in memory only. The backend README covers
that trade-off.
