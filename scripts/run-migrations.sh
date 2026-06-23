#!/usr/bin/env bash
# One-shot migration runner for a fresh Supabase project.
#
# Reads DATABASE_URL from .env.local (or env) and runs every SQL file in
# supabase/migrations/ in lexical order using `psql`. Idempotent: tracks
# which migrations have run in a __migrations table so re-running only
# applies new ones.
#
# Usage:
#   1. cp .env.local.example .env.local  (or however you store it)
#   2. Put DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
#      (Get it from Supabase dashboard → Project Settings → Database → Connection string → URI)
#   3. ./scripts/run-migrations.sh
#
# Requires: psql (brew install libpq && brew link --force libpq), bash 4+.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$REPO_DIR/supabase/migrations"

# Load DATABASE_URL from .env.local if present
if [ -f "$REPO_DIR/.env.local" ]; then
  # shellcheck disable=SC1091
  set -a
  . "$REPO_DIR/.env.local"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL is not set."
  echo "   Get the URI from Supabase dashboard → Project Settings → Database → Connection string."
  echo "   Then put it in .env.local or export it."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ psql not found. Install with:"
  echo "   brew install libpq && brew link --force libpq"
  exit 1
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "❌ Migrations directory not found: $MIGRATIONS_DIR"
  exit 1
fi

echo "→ Connecting to Supabase…"
psql "$DATABASE_URL" -tAc "SELECT 1" >/dev/null || {
  echo "❌ Could not connect with DATABASE_URL"
  exit 1
}
echo "✓ Connected."
echo ""

# Bootstrap the tracking table
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public.__migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

# Get list of already-applied migrations
APPLIED=$(psql "$DATABASE_URL" -tAc "SELECT filename FROM public.__migrations ORDER BY filename" || true)

APPLIED_COUNT=0
SKIPPED_COUNT=0
FAILED=""

for sql_file in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  basename=$(basename "$sql_file")
  if echo "$APPLIED" | grep -qx "$basename"; then
    echo "⊘ Skipping (already applied): $basename"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  echo "→ Applying: $basename"
  # Run the migration in a single transaction
  if psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 --single-transaction \
       -c "BEGIN;" \
       -f "$sql_file" \
       -c "INSERT INTO public.__migrations (filename) VALUES ('$basename');" \
       -c "COMMIT;" 2>&1; then
    echo "✓ Applied: $basename"
    APPLIED_COUNT=$((APPLIED_COUNT + 1))
  else
    echo "❌ FAILED: $basename"
    FAILED="$basename"
    break
  fi
done

echo ""
echo "─── Summary ───"
echo "Applied : $APPLIED_COUNT"
echo "Skipped : $SKIPPED_COUNT"
if [ -n "$FAILED" ]; then
  echo "Failed  : $FAILED"
  echo ""
  echo "Migration stopped on first failure. Fix the failing SQL file and re-run."
  exit 1
fi
echo "All good. ✅"
