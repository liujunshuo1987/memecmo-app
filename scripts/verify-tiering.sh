#!/usr/bin/env bash
# Verify API access tiering after deploy.
# Tests both PUBLIC (anonymous + IP rate-limit) and PROTECTED (auth-required)
# tiers, and the page-level guard on /sea-command-center.
#
# Usage:
#   ./scripts/verify-tiering.sh                 # against https://neuronsparkmedia.com
#   BASE_URL=http://localhost:3000 ./scripts/verify-tiering.sh
#
# See: docs/GEO_AEO_ALGORITHM_LOG.md → "2026-05-04 · API access tiering"

set -u
BASE_URL="${BASE_URL:-https://www.neuronsparkmedia.com}"
PASS=0; FAIL=0
HEADERS_TMP=$(mktemp); BODY_TMP=$(mktemp)
trap 'rm -f "$HEADERS_TMP" "$BODY_TMP"' EXIT

# ── pretty-print helpers ──────────────────────────────────────────────────
c_red()   { printf '\033[31m%s\033[0m' "$1"; }
c_green() { printf '\033[32m%s\033[0m' "$1"; }
c_dim()   { printf '\033[2m%s\033[0m' "$1"; }
c_bold()  { printf '\033[1m%s\033[0m' "$1"; }

ok()   { PASS=$((PASS+1)); printf '  %s %s\n' "$(c_green ✓)" "$1"; }
fail() { FAIL=$((FAIL+1)); printf '  %s %s\n' "$(c_red ✗)" "$1"; [ -n "${2:-}" ] && printf '    %s\n' "$(c_dim "$2")"; }
section() { printf '\n%s\n' "$(c_bold "▸ $1")"; }

# ── HTTP helpers ──────────────────────────────────────────────────────────
http_post() {
  local path="$1"; local body="$2"
  curl -sS -o "$BODY_TMP" -D "$HEADERS_TMP" -w '%{http_code}' \
    -X POST "$BASE_URL$path" \
    -H 'Content-Type: application/json' \
    --data-raw "$body" \
    --max-time 30
}
http_get() {
  local path="$1"
  curl -sS -o "$BODY_TMP" -D "$HEADERS_TMP" -w '%{http_code}' \
    "$BASE_URL$path" --max-time 20 -L
}

show_body() {
  local n="${1:-180}"
  printf '    body: %s\n' "$(c_dim "$(head -c "$n" "$BODY_TMP")")"
}

printf '\n%s %s\n' "$(c_bold 'API tiering verification')" "$(c_dim "→ $BASE_URL")"

# ──────────────────────────────────────────────────────────────────────────
# 1. PROTECTED tier — must return 401 without auth cookie
# ──────────────────────────────────────────────────────────────────────────
section "PROTECTED tier (anonymous → 401)"

for path in /api/brand-probes /api/sea-orchestrator /api/multi-model-query; do
  code=$(http_post "$path" '{"brandName":"Test","targetCountry":"Vietnam"}')
  if [ "$code" = "401" ]; then
    ok "$path  →  401 (auth required)"
  else
    fail "$path  →  $code (expected 401)" "$(head -c 200 "$BODY_TMP")"
  fi
done

# ──────────────────────────────────────────────────────────────────────────
# 2. PUBLIC tier — anonymous OK, then rate-limited
# ──────────────────────────────────────────────────────────────────────────
section "PUBLIC tier · /api/brand-audit (allowed anonymously)"

# A bogus URL that the audit can fetch quickly (its host returns fast)
TEST_BODY='{"url":"example.com"}'
code=$(http_post /api/brand-audit "$TEST_BODY")
if [ "$code" = "200" ]; then
  ok "first call  →  200"
else
  fail "first call  →  $code (expected 200)" "$(head -c 200 "$BODY_TMP")"
fi

section "PUBLIC tier · /api/brand-audit rate-limit (10/5min/IP)"
# Caveat: lib/api-guard.ts uses in-process Map. On Vercel each call may land on
# a fresh lambda with an empty bucket, so 12 calls in a row can all return 200.
# We test the limiter, but treat "no 429" as a known soft-failure on Vercel
# (annotated, not counted toward fatal failures). For strict global limits,
# graduate to Upstash Redis (see algorithm log Backlog).
limit_hit=0; first_429_at=0
for i in $(seq 2 12); do
  code=$(http_post /api/brand-audit "$TEST_BODY")
  if [ "$code" = "429" ] && [ "$limit_hit" = "0" ]; then
    first_429_at=$i; limit_hit=1
    retry_after=$(grep -i '^retry-after' "$HEADERS_TMP" | tr -d '\r' | awk '{print $2}')
    ok "call #$i  →  429 (rate-limited; Retry-After=$retry_after)"
    break
  fi
  printf '    %s call #%d → %s\n' "$(c_dim '·')" "$i" "$code"
done
if [ "$limit_hit" = "1" ]; then
  backend=$(grep -i '^x-ratelimit-backend' "$HEADERS_TMP" | tr -d '\r' | awk '{print $2}')
  ok "rate-limit fired (call #$first_429_at) — backend: ${backend:-unknown}"
  if [ "$backend" = "memory" ]; then
    printf '  %s using in-memory fallback; for global counters set UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN\n' "$(c_dim '⚠')"
  fi
else
  printf '  %s no 429 within 12 calls (with Upstash this should fire reliably; check X-RateLimit-Backend header)\n' "$(c_dim '⚠')"
fi

# ──────────────────────────────────────────────────────────────────────────
# 3. PUBLIC tier — /api/regional-audit
# ──────────────────────────────────────────────────────────────────────────
section "PUBLIC tier · /api/regional-audit (allowed anonymously)"
code=$(http_post /api/regional-audit '{"brandHomepage":"https://example.com","targetCountry":"VN"}')
case "$code" in
  200|429)
    if [ "$code" = "200" ]; then
      ok "first call  →  200"
    else
      ok "first call  →  429 (already rate-limited from a previous run, acceptable)"
    fi
    ;;
  *)
    fail "first call  →  $code (expected 200 or 429)" "$(head -c 200 "$BODY_TMP")"
    ;;
esac

# ──────────────────────────────────────────────────────────────────────────
# 4. Page-level guard
# ──────────────────────────────────────────────────────────────────────────
section "Page-level guard"

# /sea-command-center should be PUBLIC (200, no redirect)
code=$(curl -sS -o /dev/null -w '%{http_code}|%{url_effective}' \
  -L --max-time 15 "$BASE_URL/sea-command-center")
status=${code%%|*}
final=${code##*|}
if [ "$status" = "200" ] && [[ "$final" != *"/login"* ]]; then
  ok "/sea-command-center  →  200 (public)"
else
  fail "/sea-command-center  →  $status, redirected to $final"
fi

# /dashboard should redirect to /login when unauthed
code=$(curl -sS -o /dev/null -w '%{http_code}|%{url_effective}' \
  --max-time 15 "$BASE_URL/dashboard")
status=${code%%|*}
final=${code##*|}
if [ "$status" = "307" ] || [ "$status" = "302" ] || [ "$status" = "303" ]; then
  ok "/dashboard  →  $status redirect (gated)"
else
  # Some setups follow the redirect server-side and return final 200; check Location
  location=$(curl -sS -o /dev/null -D - --max-time 15 "$BASE_URL/dashboard" | grep -i '^location' | tr -d '\r')
  if [[ "$location" == *"/login"* ]]; then
    ok "/dashboard  →  Location: /login (gated)"
  else
    fail "/dashboard  →  $status (expected redirect to /login)" "Location: $location"
  fi
fi

# /audit should be 404 (orphan removed)
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE_URL/audit")
if [ "$code" = "404" ]; then
  ok "/audit  →  404 (orphan removed)"
else
  fail "/audit  →  $code (expected 404)"
fi

# ──────────────────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL))
printf '\n%s  %s passed · %s failed · %s total\n' \
  "$(c_bold Summary:)" "$(c_green "$PASS")" "$([ "$FAIL" -gt 0 ] && c_red "$FAIL" || c_dim 0)" "$TOTAL"

[ "$FAIL" -eq 0 ]
