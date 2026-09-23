#!/usr/bin/env bash
# Production deploy with the two checks a bare `vercel --prod` skips.
#
# 1. Inngest sync. Vercel marks a deployment READY before Inngest has re-read
#    the function manifest; a run dispatched in that window sits `queued`
#    (observed 2026-09-07: 98s queued until a manual PUT returned
#    "modified": true). PUT /api/inngest forces the sync and reports whether
#    the manifest actually changed.
# 2. Verify the production alias serves the new deployment, not the old one.
set -euo pipefail
cd "$(dirname "$0")/.."
APP_URL="${APP_URL:-https://app.memecmo.ai}"

echo "▶ deploying…"
# Keep stderr: vercel prints progress AND errors there, and with pipefail a
# silent non-zero exit used to kill the script before any diagnostic line.
out=$(vercel --prod --yes 2>&1) || { echo "✗ vercel exited non-zero:"; echo "$out" | tail -5; exit 1; }
url=$(printf '%s' "$out" | python3 -c "import sys,re; t=sys.stdin.read(); m=re.search(r'Deployment (\S+) ready', t); print(m.group(1) if m else '')")
[ -n "$url" ] || { echo "✗ deploy did not report ready:"; echo "$out" | tail -5; exit 1; }
echo "  $url"

echo "▶ syncing Inngest…"
# The Vercel↔Inngest integration may already be syncing when we ask; that is
# not a failure — wait and ask again.
for attempt in 1 2 3 4 5 6; do
  # --max-time + `|| true`: a curl timeout (exit 28) is a network flake to
  # retry, not a deploy failure — it aborted the script once on 2026-09-21.
  sync=$(curl -sS --max-time 25 -X PUT "$APP_URL/api/inngest" 2>&1 || true)
  echo "  $sync"
  echo "$sync" | grep -q '"Successfully registered"' && break
  echo "$sync" | grep -qE 'already in progress|timeout|timed out|Could not resolve|Connection reset' || { echo "✗ Inngest sync failed"; exit 1; }
  sleep 10
done
echo "$sync" | grep -q '"Successfully registered"' || { echo "✗ Inngest sync still busy after retries"; exit 1; }

echo "▶ verifying alias…"
# Match the row for THIS deployment — never a fixed line number (the first
# attempt read row 7 and verified the previous deployment instead).
state=$(vercel ls --prod 2>&1 | grep -F "$url" || true)   # table goes to stderr
echo "  ${state:-<not listed>}"
echo "$state" | grep -q "● Ready" || { echo "✗ $url not Ready in production list"; exit 1; }
echo "✓ deployed + synced"
