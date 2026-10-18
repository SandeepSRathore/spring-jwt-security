#!/usr/bin/env bash
#
# End-to-end curl test suite for the JWT auth API.
#
# Start the app with short token lifetimes first:
#   mvn spring-boot:run -Dspring-boot.run.profiles=curltest
# then:
#   ./test-api.sh                 # BASE_URL defaults to http://localhost:8080
#
# The expiry section waits ~60s on purpose. The rate-limit section runs last and blocks
# logins from your IP for up to a minute, so wait a minute before re-running the suite.
#
# Requires: curl, jq, openssl, xxd.

set -u

BASE="${BASE_URL:-http://localhost:8080}"
# Must match the server's app.jwt.secret. Used ONLY to forge tokens that prove the server
# checks more than the signature (issuer, audience, typ, session binding...).
JWT_SECRET="${JWT_SECRET:-ZGV2LW9ubHktc2VjcmV0LWNoYW5nZS1tZS1iZWZvcmUtZGVwbG95aW5nLTEyMzQ1Ng==}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@12345}"
PASSWORD='Str0ng!Pass'
NEW_PASSWORD='N3w!Passw0rd'
RUN=$(date +%s)

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PASSED=0
FAILED=0
FAILURES=""

for tool in curl jq openssl xxd; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool"; exit 2; }
done

# ---------------------------------------------------------------- helpers

C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'

section() { printf '\n%s== %s ==%s\n' "$C_BOLD" "$1" "$C_OFF"; }

# req METHOD PATH [JSON_BODY] [BEARER_TOKEN] [extra curl args...]
# Sets STATUS, BODY, HEADERS.
req() {
  local method=$1 path=$2 data=${3:-} token=${4:-}
  if [ $# -ge 4 ]; then shift 4; else shift $#; fi
  local args=(-s -X "$method" "$BASE$path" -D "$TMP/headers" -o "$TMP/body" -w '%{http_code}')
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' --data "$data")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  STATUS=$(curl "${args[@]}" "$@")
  BODY=$(cat "$TMP/body")
  HEADERS=$(tr -d '\r' < "$TMP/headers")
}

json() { printf '%s' "$BODY" | jq -r "$1" 2>/dev/null; }

record() { # ok description detail
  if [ "$1" = ok ]; then
    PASSED=$((PASSED + 1)); printf '  %sPASS%s %s\n' "$C_GREEN" "$C_OFF" "$2"
  else
    FAILED=$((FAILED + 1)); FAILURES="$FAILURES\n  - $2"
    printf '  %sFAIL%s %s\n       %s%s%s\n' "$C_RED" "$C_OFF" "$2" "$C_DIM" "$3" "$C_OFF"
  fi
}

# expect DESCRIPTION STATUS [ERROR_CODE]: checks the last response.
expect() {
  local desc=$1 want_status=$2 want_code=${3:-}
  local got_code; got_code=$(json '.error // empty')
  if [ "$STATUS" = "$want_status" ] && { [ -z "$want_code" ] || [ "$got_code" = "$want_code" ]; }; then
    record ok "$desc"
  else
    record fail "$desc" "expected $want_status${want_code:+ $want_code}, got $STATUS $got_code :: ${BODY:0:240}"
  fi
}

# assert DESCRIPTION VALUE_A VALUE_B: passes when equal.
assert_eq() {
  if [ "$2" = "$3" ]; then record ok "$1"; else record fail "$1" "expected '$3', got '$2'"; fi
}

has_header() { printf '%s\n' "$HEADERS" | grep -qi "^$1"; }

register() { req POST /api/auth/register "{\"email\":\"$1\",\"name\":\"$2\",\"password\":\"$3\"}"; }
login() { req POST /api/auth/login "{\"email\":\"$1\",\"password\":\"$2\"}" "" -A "${3:-curl-tests}"; }
refresh() { req POST /api/auth/refresh "{\"refreshToken\":\"$1\"}" "${2:-}"; }
me() { req GET /api/users/me "" "$1"; }

# ---- JWT forging (base64url + HMAC-SHA256 with openssl)
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
b64url_decode() {
  local s; s=$(printf '%s' "$1" | tr '_-' '/+')
  case $(( ${#s} % 4 )) in 2) s="$s==" ;; 3) s="$s=" ;; esac
  printf '%s' "$s" | openssl base64 -d -A
}
SECRET_HEX=$(printf '%s' "$JWT_SECRET" | openssl base64 -d -A | xxd -p | tr -d '\n')
sign() { printf '%s' "$1" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$2" -binary | b64url; }
# forge HEADER_JSON PAYLOAD_JSON [KEY_HEX]
forge() {
  local h p; h=$(printf '%s' "$1" | jq -c . | b64url); p=$(printf '%s' "$2" | jq -c . | b64url)
  printf '%s.%s.%s' "$h" "$p" "$(sign "$h.$p" "${3:-$SECRET_HEX}")"
}
claims_of() { b64url_decode "$(printf '%s' "$1" | cut -d. -f2)"; }
header_of() { b64url_decode "$(printf '%s' "$1" | cut -d. -f1)"; }

# ---------------------------------------------------------------- tests

section "0. Health"
req GET /api/public/ping
expect "public endpoint reachable without a token" 200
[ "$STATUS" = 200 ] || { echo "Server not reachable at $BASE — start it first."; exit 2; }

A_EMAIL="alice.$RUN@example.com"
section "1. Registration"
register "$A_EMAIL" Alice "$PASSWORD"
expect "register a new user" 201
assert_eq "new user gets only ROLE USER" "$(json '.roles | join(",")')" "USER"
assert_eq "password hash is never returned" "$(json 'has("password") or has("passwordHash")')" "false"
register "$(echo "$A_EMAIL" | tr a-z A-Z)" Alice2 "$PASSWORD"
expect "duplicate email (case-insensitive) is rejected" 409 email_taken
register "weak.$RUN@example.com" Weak "password"
expect "weak password is rejected" 400 validation_failed
assert_eq "validation error names the password field" "$(json '.fieldErrors | has("password")')" "true"
register "not-an-email" Bad "$PASSWORD"
expect "invalid email is rejected" 400 validation_failed
req POST /api/auth/register '{"email": "broken json'
expect "malformed JSON is rejected" 400 malformed_request

section "2. Login"
login "$A_EMAIL" "$PASSWORD" "alice-laptop"
expect "login with valid credentials" 200
A_AT=$(json .accessToken); A_RT=$(json .refreshToken); A_SID=$(json .sessionId)
assert_eq "token type is Bearer" "$(json .tokenType)" "Bearer"
assert_eq "access token is a 3-part JWT" "$(printf '%s' "$A_AT" | awk -F. '{print NF}')" "3"
assert_eq "access token header typ is at+jwt" "$(header_of "$A_AT" | jq -r .typ)" "at+jwt"
assert_eq "refresh token is opaque (not a JWT)" "$(printf '%s' "$A_RT" | awk -F. '{print NF}')" "1"
has_header "cache-control: no-store" && record ok "token response is not cacheable (Cache-Control: no-store)" \
  || record fail "token response is not cacheable" "$HEADERS"
login "$A_EMAIL" "wrong-Password1!"
expect "wrong password" 401 invalid_credentials
WRONG_PW_MSG=$(json .message)
login "nobody.$RUN@example.com" "$PASSWORD"
expect "unknown email" 401 invalid_credentials
assert_eq "unknown email and wrong password give the same message (no user enumeration)" "$(json .message)" "$WRONG_PW_MSG"
req POST /api/auth/login '{"email":""}'
expect "missing login fields" 400 validation_failed
login "  $(echo "$A_EMAIL" | tr a-z A-Z)  " "$PASSWORD"
expect "email is trimmed and case-insensitive at login" 200

section "3. Calling protected endpoints"
me "$A_AT"
expect "GET /api/users/me with a valid access token" 200
assert_eq "/me returns the logged-in user" "$(json .email)" "$A_EMAIL"
A_ID=$(json .id)
req GET /api/users/me
expect "no token" 401 missing_token
has_header "www-authenticate: Bearer" && record ok "401 carries WWW-Authenticate: Bearer" || record fail "401 carries WWW-Authenticate" "$HEADERS"
me "not-a-jwt"
expect "garbage token" 401 invalid_token
req GET /api/users/me "" "" -H "Authorization: Basic YWxpY2U6c2VjcmV0"
expect "Basic auth is not accepted" 401 missing_token
req GET "/api/users/me?access_token=$A_AT"
expect "token in query string is ignored (would leak into logs)" 401 missing_token
req GET /api/users/me "" "" -H "Authorization: bearer $A_AT"
expect "scheme name is case-insensitive per RFC 6750" 200
req GET /api/admin/users "" "$A_AT"
expect "USER calling ADMIN endpoint is forbidden" 403 access_denied

section "4. Tampered and forged tokens"
H_PART=$(printf '%s' "$A_AT" | cut -d. -f1); SIG_PART=$(printf '%s' "$A_AT" | cut -d. -f3)
A_CLAIMS=$(claims_of "$A_AT")
EVIL_PAYLOAD=$(printf '%s' "$A_CLAIMS" | jq -c '.roles=["ADMIN","USER"]' | b64url)
me "$H_PART.$EVIL_PAYLOAD.$SIG_PART"
expect "payload edited to add ADMIN, original signature kept" 401 invalid_token
NONE_HEADER=$(printf '{"alg":"none","typ":"at+jwt"}' | b64url)
me "$NONE_HEADER.$EVIL_PAYLOAD."
expect "alg=none (unsigned) token" 401 invalid_token
WRONG_KEY_HEX=$(openssl rand -hex 32)
me "$(forge '{"alg":"HS256","typ":"at+jwt"}' "$A_CLAIMS" "$WRONG_KEY_HEX")"
expect "token signed with a different key" 401 invalid_token
NOW=$(date +%s)

# Positive control: if the harness re-signs the untouched claims with the real key, the
# server must accept it. That proves the rejections below come from claim checks, not from
# a broken forging helper.
me "$(forge '{"alg":"HS256","typ":"at+jwt"}' "$A_CLAIMS")"
expect "control: re-signed original claims with the real key are accepted" 200
me "$(forge '{"alg":"HS256","typ":"JWT"}' "$A_CLAIMS")"
expect "real key but typ=JWT (not an access token)" 401 invalid_token
me "$(forge '{"alg":"HS256","typ":"at+jwt"}' "$(printf '%s' "$A_CLAIMS" | jq '.iss="https://evil.example"')")"
expect "real key but wrong issuer" 401 invalid_token
me "$(forge '{"alg":"HS256","typ":"at+jwt"}' "$(printf '%s' "$A_CLAIMS" | jq '.aud=["some-other-api"]')")"
expect "real key but wrong audience" 401 invalid_token
me "$(forge '{"alg":"HS256","typ":"at+jwt"}' "$(printf '%s' "$A_CLAIMS" | jq '.sid="00000000-0000-0000-0000-000000000000"')")"
expect "real key but session id that does not exist" 401 invalid_token
me "$(forge '{"alg":"HS256","typ":"at+jwt"}' "$(printf '%s' "$A_CLAIMS" | jq 'del(.sid)')")"
expect "real key but sid claim missing" 401 invalid_token
me "$(forge '{"alg":"HS256","typ":"at+jwt"}' "$(printf '%s' "$A_CLAIMS" | jq --argjson n "$NOW" '.iat=$n-120 | .nbf=$n-120 | .exp=$n-60')")"
expect "real key but exp in the past" 401 token_expired
me "$(forge '{"alg":"HS256","typ":"at+jwt"}' "$(printf '%s' "$A_CLAIMS" | jq --argjson n "$NOW" '.nbf=$n+600')")"
expect "real key but nbf in the future" 401 invalid_token
me "$(forge '{"alg":"HS256","typ":"at+jwt"}' "$(printf '%s' "$A_CLAIMS" | jq '.sub="1" | .roles=["ADMIN","USER"]')")"
expect "real key, sub switched to admin on alice's session (privilege escalation)" 401 invalid_token

section "5. Refresh token rotation"
refresh "$A_RT"
expect "refresh with a valid refresh token" 200
A_AT2=$(json .accessToken); A_RT2=$(json .refreshToken)
[ "$A_RT2" != "$A_RT" ] && record ok "refresh returns a NEW refresh token (rotation)" || record fail "rotation" "same token returned"
assert_eq "session id is unchanged by refresh" "$(json .sessionId)" "$A_SID"
me "$A_AT2"
expect "new access token works" 200
me "$A_AT"
expect "previous access token still works until it expires (stateless, short TTL)" 200
refresh "this-token-was-never-issued"
expect "unknown refresh token" 401 invalid_refresh_token
req POST /api/auth/refresh '{}'
expect "refresh with no token" 400 validation_failed
refresh "$A_RT2" "expired.or.garbage.access.token"
expect "/refresh ignores a stale Authorization header" 200
A_AT=$(json .accessToken); A_RT=$(json .refreshToken)
refresh "$A_AT"
expect "an access token cannot be used as a refresh token (too long to be one)" 400 validation_failed

section "6. Stolen refresh token (reuse detection)"
login "$A_EMAIL" "$PASSWORD" "alice-phone"
PHONE_RT1=$(json .refreshToken)
refresh "$PHONE_RT1"
expect "attacker uses the stolen refresh token first" 200
EVIL_AT=$(json .accessToken); EVIL_RT=$(json .refreshToken)
refresh "$PHONE_RT1"
expect "victim's app then presents the same (already used) token" 401 refresh_token_reused
refresh "$EVIL_RT"
expect "attacker's rotated refresh token is now dead" 401 session_revoked
me "$EVIL_AT"
expect "attacker's access token is dead immediately (not at expiry)" 401 session_revoked
refresh "$A_RT"
expect "alice's other session (laptop) is unaffected" 200
A_AT=$(json .accessToken); A_RT=$(json .refreshToken)

section "7. Concurrent refresh with the same token (race)"
login "$A_EMAIL" "$PASSWORD" "alice-tablet"
RACE_RT=$(json .refreshToken)
for i in 1 2; do
  curl -s -X POST "$BASE/api/auth/refresh" -H 'Content-Type: application/json' \
    -d "{\"refreshToken\":\"$RACE_RT\"}" -o "$TMP/race$i" -w '%{http_code}' > "$TMP/race$i.status" &
done
wait
CODES="$(printf '%s\n%s\n' "$(cat "$TMP/race1.status")" "$(cat "$TMP/race2.status")" | sort | tr '\n' ' ')"
assert_eq "exactly one parallel refresh wins, the other is treated as reuse" "$CODES" "200 401 "
WINNER=1; [ "$(cat "$TMP/race1.status")" = 200 ] || WINNER=2
LOSER=$((3 - WINNER))
assert_eq "losing request reports refresh_token_reused" "$(jq -r .error "$TMP/race$LOSER")" "refresh_token_reused"
refresh "$(jq -r .refreshToken "$TMP/race$WINNER")"
expect "winner's new token is revoked too (whole session killed)" 401 session_revoked

section "8. Logout"
login "$A_EMAIL" "$PASSWORD" "alice-kiosk"
KIOSK_AT=$(json .accessToken); KIOSK_RT=$(json .refreshToken)
me "$KIOSK_AT"
expect "kiosk session works before logout" 200
req POST /api/auth/logout "{\"refreshToken\":\"$KIOSK_RT\"}"
expect "logout" 204
me "$KIOSK_AT"
expect "access token copied before logout is rejected afterwards" 401 session_revoked
refresh "$KIOSK_RT"
expect "refresh token is rejected after logout" 401 session_revoked
req POST /api/auth/logout "{\"refreshToken\":\"$KIOSK_RT\"}"
expect "logout is idempotent" 204
req POST /api/auth/logout '{"refreshToken":"unknown-token"}'
expect "logout with unknown token does not leak whether it existed" 204

section "9. Managing sessions (devices)"
login "$A_EMAIL" "$PASSWORD" "alice-work-pc"
WORK_AT=$(json .accessToken); WORK_SID=$(json .sessionId)
req GET /api/auth/sessions "" "$A_AT"
expect "list my active sessions" 200
assert_eq "exactly one session is flagged current" "$(json '[.[] | select(.current)] | length')" "1"
assert_eq "current session is the laptop session" "$(json '.[] | select(.current) | .id')" "$A_SID"
assert_eq "user agent of the work PC session is recorded" "$(json ".[] | select(.id==\"$WORK_SID\") | .userAgent")" "alice-work-pc"
req DELETE "/api/auth/sessions/$WORK_SID" "" "$A_AT"
expect "revoke the work PC session from the laptop" 204
me "$WORK_AT"
expect "work PC access token is rejected" 401 session_revoked
req DELETE "/api/auth/sessions/$(uuidgen 2>/dev/null || echo 11111111-2222-3333-4444-555555555555)" "" "$A_AT"
expect "revoking an unknown session" 404 session_not_found
req DELETE "/api/auth/sessions/not-a-uuid" "" "$A_AT"
expect "malformed session id" 400 malformed_request

section "10. Admin: role-based access"
login "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "admin-console"
expect "admin login" 200
ADMIN_AT=$(json .accessToken); ADMIN_SID=$(json .sessionId)
req GET /api/admin/users "" "$ADMIN_AT"
expect "ADMIN can list users" 200
assert_eq "user list contains alice" "$(json "[.[] | select(.email==\"$A_EMAIL\")] | length")" "1"
req DELETE "/api/auth/sessions/$ADMIN_SID" "" "$A_AT"
expect "alice cannot revoke the admin's session (looks like 404, not 403)" 404 session_not_found
me "$ADMIN_AT"
expect "admin session still alive" 200
ADMIN_ID=$(json .id)
req POST "/api/admin/users/$ADMIN_ID/disable" "" "$ADMIN_AT"
expect "admin cannot disable themselves" 400 cannot_disable_self
req POST "/api/admin/users/999999/disable" "" "$ADMIN_AT"
expect "disable unknown user" 404 user_not_found

section "11. Max active sessions per user (curltest profile: 3)"
C_EMAIL="carol.$RUN@example.com"
register "$C_EMAIL" Carol "$PASSWORD"
for i in 1 2 3 4; do
  login "$C_EMAIL" "$PASSWORD" "carol-device-$i"
  eval "C_AT_$i=\$(json .accessToken)"
done
expect "4th login succeeds" 200
me "$C_AT_1"
expect "oldest session was signed out to make room" 401 session_revoked
me "$C_AT_4"
expect "newest session works" 200
req GET /api/auth/sessions "" "$C_AT_4"
assert_eq "only 3 sessions remain active" "$(json length)" "3"

section "12. Logout from all devices"
req POST /api/auth/logout-all "" "$C_AT_4"
expect "logout-all" 200
assert_eq "3 sessions revoked" "$(json .sessionsRevoked)" "3"
for i in 2 3 4; do eval "me \"\$C_AT_$i\""; expect "carol device $i access token rejected" 401 session_revoked; done

section "13. Change password"
D_EMAIL="dave.$RUN@example.com"
register "$D_EMAIL" Dave "$PASSWORD"
login "$D_EMAIL" "$PASSWORD" "dave-laptop"; D1_AT=$(json .accessToken)
login "$D_EMAIL" "$PASSWORD" "dave-phone";  D2_AT=$(json .accessToken); D2_RT=$(json .refreshToken)
req POST /api/auth/change-password "{\"currentPassword\":\"Wrong!Pass1\",\"newPassword\":\"$NEW_PASSWORD\"}" "$D1_AT"
expect "wrong current password" 400 invalid_current_password
req POST /api/auth/change-password "{\"currentPassword\":\"$PASSWORD\",\"newPassword\":\"$PASSWORD\"}" "$D1_AT"
expect "new password equal to the old one" 400 password_reuse
req POST /api/auth/change-password "{\"currentPassword\":\"$PASSWORD\",\"newPassword\":\"short\"}" "$D1_AT"
expect "new password violates policy" 400 validation_failed
req POST /api/auth/change-password "{\"currentPassword\":\"$PASSWORD\",\"newPassword\":\"$NEW_PASSWORD\"}" "$D1_AT"
expect "change password" 200
assert_eq "one other session revoked" "$(json .otherSessionsRevoked)" "1"
me "$D1_AT"
expect "the session that changed the password stays signed in" 200
me "$D2_AT"
expect "other device's access token is rejected" 401 session_revoked
refresh "$D2_RT"
expect "other device's refresh token is rejected" 401 session_revoked
login "$D_EMAIL" "$PASSWORD"
expect "old password no longer works" 401 invalid_credentials
login "$D_EMAIL" "$NEW_PASSWORD"
expect "new password works" 200

section "14. Brute force: account lock-out (curltest profile: 3 failures, 30s)"
E_EMAIL="eve.$RUN@example.com"
register "$E_EMAIL" Eve "$PASSWORD"
login "$E_EMAIL" "Wrong!Pass1"; expect "failure 1" 401 invalid_credentials
login "$E_EMAIL" "Wrong!Pass2"; expect "failure 2" 401 invalid_credentials
login "$E_EMAIL" "Wrong!Pass3"; expect "failure 3 locks the account" 423 account_locked
has_header "retry-after:" && record ok "423 includes Retry-After" || record fail "423 includes Retry-After" "$HEADERS"
login "$E_EMAIL" "$PASSWORD"
expect "even the correct password is refused while locked" 423 account_locked
req GET /api/admin/users "" "$ADMIN_AT"
E_ID=$(json ".[] | select(.email==\"$E_EMAIL\") | .id")
assert_eq "admin sees eve as locked" "$(json ".[] | select(.email==\"$E_EMAIL\") | .locked")" "true"
req POST "/api/admin/users/$E_ID/unlock" "" "$ADMIN_AT"
expect "admin unlocks eve" 200
login "$E_EMAIL" "$PASSWORD"
expect "eve can log in after unlock" 200

F_EMAIL="frank.$RUN@example.com"
register "$F_EMAIL" Frank "$PASSWORD"
for i in 1 2 3; do login "$F_EMAIL" "Wrong!Pass$i"; done
expect "frank locked (will auto-unlock during the expiry wait)" 423 account_locked

section "15. Admin disables an account"
B_EMAIL="bob.$RUN@example.com"
register "$B_EMAIL" Bob "$PASSWORD"; B_ID=$(json .id)
login "$B_EMAIL" "$PASSWORD"; B_AT=$(json .accessToken); B_RT=$(json .refreshToken)
req POST "/api/admin/users/$B_ID/disable" "" "$ADMIN_AT"
expect "admin disables bob" 200
assert_eq "bob has no active sessions left" "$(json .activeSessions)" "0"
me "$B_AT"
expect "bob's access token is rejected immediately" 401 account_disabled
refresh "$B_RT"
expect "bob's refresh token is rejected" 401 session_revoked
login "$B_EMAIL" "$PASSWORD"
expect "bob cannot log in (only revealed with the right password)" 403 account_disabled
login "$B_EMAIL" "Wrong!Pass1"
expect "wrong password on a disabled account looks like any other failure" 401 invalid_credentials
req POST "/api/admin/users/$B_ID/enable" "" "$ADMIN_AT"
expect "admin re-enables bob" 200
login "$B_EMAIL" "$PASSWORD"
expect "bob can log in again" 200

section "16. Expiry (curltest profile: access 15s, refresh 40s, lock-out 30s)"
G_EMAIL="grace.$RUN@example.com"
register "$G_EMAIL" Grace "$PASSWORD"
login "$G_EMAIL" "$PASSWORD"
G_AT=$(json .accessToken); G_RT=$(json .refreshToken)
me "$G_AT"
expect "fresh access token works" 200
printf '  %swaiting 17s for the access token to expire...%s\n' "$C_DIM" "$C_OFF"; sleep 17
me "$G_AT"
expect "expired access token" 401 token_expired
printf '%s\n' "$HEADERS" | grep -qi '^www-authenticate: Bearer error="invalid_token"' \
  && record ok "expired token response has RFC 6750 error header" || record fail "RFC 6750 header" "$HEADERS"
refresh "$G_RT"
expect "client recovers by calling /refresh (the normal flow)" 200
G_AT=$(json .accessToken); G_RT=$(json .refreshToken)
me "$G_AT"
expect "new access token works" 200
printf '  %swaiting 42s for the refresh token to expire...%s\n' "$C_DIM" "$C_OFF"; sleep 42
refresh "$G_RT"
expect "expired refresh token: user must log in again" 401 refresh_token_expired
login "$F_EMAIL" "$PASSWORD"
expect "frank's lock-out expired on its own" 200

section "17. Login rate limit per client IP (curltest profile: 40/min)"
LIMITED=""
for i in $(seq 1 45); do
  login "ratelimit.$RUN@example.com" "Wrong!Pass1"
  if [ "$STATUS" = 429 ]; then LIMITED=$i; break; fi
done
[ -n "$LIMITED" ] && record ok "429 too_many_requests after $LIMITED rapid attempts" || record fail "rate limit" "no 429 after 45 attempts"
has_header "retry-after:" && record ok "429 includes Retry-After" || record fail "429 includes Retry-After" "$HEADERS"

# ---------------------------------------------------------------- summary
printf '\n%s%d passed, %d failed%s\n' "$C_BOLD" "$PASSED" "$FAILED" "$C_OFF"
if [ "$FAILED" -gt 0 ]; then printf "Failures:$FAILURES\n"; exit 1; fi
