#!/usr/bin/env bash
set -euo pipefail

# Full-stack deploy: assign build metadata, rebuild images, recreate services, migrate.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# shellcheck disable=SC1091
source "$ROOT/deploy/scripts/lib/build-metadata.sh"
build_metadata

export APP_VERSION GIT_SHA BUILD_TIME

echo "==> Deploy ${APP_VERSION} (${GIT_SHA}) built at ${BUILD_TIME}"

echo "==> Building images"
docker compose build

echo "==> Starting services"
docker compose up -d --force-recreate

echo "==> Running database migrations"
docker compose exec -T backend-api alembic upgrade head

if command -v curl >/dev/null 2>&1; then
  echo "==> Verifying API system version"
  api_url="${PUBLIC_API_URL:-${NEXT_PUBLIC_API_BASE_URL:-https://api.stockwealthbd.com/api/v1}}"
  api_url="${api_url%/}"
  system_json="$(curl -fsS "${api_url}/system")"
  case "$system_json" in
    *"\"version\":\"${APP_VERSION}\""*) ;;
    *)
      echo "API /system version mismatch:" >&2
      echo "$system_json" >&2
      exit 1
      ;;
  esac
  echo "API /system: ${system_json}"
fi

if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ZONE_ID:-}" ]; then
  bash "$ROOT/deploy/scripts/purge-cloudflare-cache.sh"
else
  echo "==> Skipping Cloudflare purge (set CF_API_TOKEN and CF_ZONE_ID in .env to enable)"
fi

echo "==> Deploy complete: ${APP_VERSION} (${GIT_SHA})"
