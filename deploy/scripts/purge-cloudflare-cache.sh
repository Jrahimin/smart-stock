#!/usr/bin/env bash
set -euo pipefail

# Purge Cloudflare cache for the frontend zone after a deploy.
# Requires CF_API_TOKEN and CF_ZONE_ID in the environment or root .env file.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${CF_API_TOKEN:?CF_API_TOKEN is required to purge Cloudflare cache}"
: "${CF_ZONE_ID:?CF_ZONE_ID is required to purge Cloudflare cache}"

echo "Purging Cloudflare cache for zone ${CF_ZONE_ID}..."

response="$(curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}')"

if command -v jq >/dev/null 2>&1; then
  success="$(echo "$response" | jq -r '.success')"
  if [ "$success" != "true" ]; then
    echo "$response" >&2
    exit 1
  fi
else
  echo "$response" | grep -q '"success":true' || {
    echo "$response" >&2
    exit 1
  }
fi

echo "Cloudflare cache purge requested successfully."
