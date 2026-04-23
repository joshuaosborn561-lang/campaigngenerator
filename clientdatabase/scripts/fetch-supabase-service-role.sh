#!/usr/bin/env bash
# Fetches the project's legacy service_role API key (JWT) via the Supabase CLI
# and prints SUPABASE_URL and SUPABASE_SERVICE_KEY lines for .env.
#
# Prerequisites:
#   - SUPABASE_ACCESS_TOKEN: create at https://supabase.com/dashboard/account/tokens
#     (a Notion "Supabase" row with an sbp_... value is this same type of token)
#   - npx and Node (to parse JSON reliably)
#
# The CLI does not "generate" a new JWT; it returns keys already provisioned for the
# project. To rotate, use Dashboard → Project Settings → API (Legacy) or the new
# key flows documented at https://supabase.com/docs/guides/api
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN=sbp_...
#   export SUPABASE_PROJECT_REF=klomihumrgwoixbzxypr
#   ./fetch-supabase-service-role.sh
#
#   # Or derive ref from an existing project URL:
#   export SUPABASE_URL=https://klomihumrgwoixbzxypr.supabase.co
#   ./fetch-supabase-service-role.sh
#
set -euo pipefail

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Error: set SUPABASE_ACCESS_TOKEN (Supabase access token, not the anon/service_role JWT)" >&2
  exit 1
fi

REF="${SUPABASE_PROJECT_REF:-}"
if [[ -z "$REF" && -n "${SUPABASE_URL:-}" ]]; then
  if [[ "$SUPABASE_URL" =~ ^https?://([a-z0-9]+)\.supabase\.co/?$ ]]; then
    REF="${BASH_REMATCH[1]}"
  fi
fi
if [[ -z "$REF" ]]; then
  echo "Error: set SUPABASE_PROJECT_REF or a SUPABASE_URL like https://<ref>.supabase.co" >&2
  exit 1
fi

# Run from monorepo root (parent of clientdatabase) so npx supabase is consistent
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

OUT="$(SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" npx supabase@latest projects api-keys --project-ref "$REF" -o json)"

SR="$(node -e "
const j = JSON.parse(process.argv[1]);
const row = j.find((k) => k.name === 'service_role' && (k.type === 'legacy' || k.id === 'service_role'));
if (!row || !row.api_key) { console.error('No legacy service_role key in CLI output (new secret keys may be redacted; use Dashboard).'); process.exit(1); }
console.log(row.api_key);
" "$OUT")"

URL="https://${REF}.supabase.co"
echo "SUPABASE_URL=$URL"
echo "SUPABASE_SERVICE_KEY=$SR"
