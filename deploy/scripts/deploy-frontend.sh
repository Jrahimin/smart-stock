#!/usr/bin/env bash
set -euo pipefail

# Rebuild and redeploy the frontend with fresh build metadata, verify the running
# container matches the new image, and optionally purge Cloudflare cache.

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

PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-${FRONTEND_BASE_URL:-https://stockwealthbd.com}}"
PUBLIC_SITE_URL="${PUBLIC_SITE_URL%/}"

echo "==> Frontend deploy ${APP_VERSION} (${GIT_SHA}) built at ${BUILD_TIME}"

echo "==> Building frontend image (fresh npm build; BUILD_TIME busts Docker layer cache)"
docker compose build frontend

echo "==> Recreating frontend container"
docker compose up -d --force-recreate --no-deps frontend

echo "==> Waiting for frontend health"
deadline=$((SECONDS + 120))
while [ "$SECONDS" -lt "$deadline" ]; do
  if docker compose ps frontend 2>/dev/null | grep -q "(healthy)"; then
    break
  fi
  sleep 3
done

if ! docker compose ps frontend | grep -q "(healthy)"; then
  echo "Frontend container did not become healthy within 120s." >&2
  docker compose logs --tail=50 frontend >&2 || true
  exit 1
fi

image_version="$(docker image inspect smart-stock-frontend:latest --format '{{index .Config.Labels "org.opencontainers.image.version"}}')"
if [ "$image_version" != "$APP_VERSION" ]; then
  echo "Image label version mismatch: expected ${APP_VERSION}, got ${image_version}" >&2
  exit 1
fi

container_id="$(docker compose ps -q frontend)"
running_image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
latest_image_id="$(docker image inspect smart-stock-frontend:latest --format '{{.Id}}')"
if [ "$running_image_id" != "$latest_image_id" ]; then
  echo "Running container is not using smart-stock-frontend:latest." >&2
  exit 1
fi

echo "==> Verifying build-info.json inside container"
container_build_info="$(docker compose exec -T frontend wget -qO- http://127.0.0.1:3000/build-info.json)"

verify_build_field() {
  local field="$1"
  local expected="$2"
  case "$container_build_info" in
    *"\"${field}\":\"${expected}\""*) return 0 ;;
    *)
      echo "Container build-info.json ${field} mismatch (expected ${expected}):" >&2
      echo "$container_build_info" >&2
      exit 1
      ;;
  esac
}

verify_build_field version "$APP_VERSION"
verify_build_field git_sha "$GIT_SHA"
verify_build_field build_time "$BUILD_TIME"

echo "Container build-info.json: ${container_build_info}"

if command -v curl >/dev/null 2>&1; then
  echo "==> Verifying public build-info.json at ${PUBLIC_SITE_URL}/build-info.json"
  public_build_info="$(curl -fsS "${PUBLIC_SITE_URL}/build-info.json")"
  case "$public_build_info" in
    *"\"version\":\"${APP_VERSION}\""*) ;;
    *)
      echo "Public build-info.json version mismatch:" >&2
      echo "$public_build_info" >&2
      exit 1
      ;;
  esac
  echo "Public build-info.json: ${public_build_info}"
fi

if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ZONE_ID:-}" ]; then
  bash "$ROOT/deploy/scripts/purge-cloudflare-cache.sh"
else
  echo "==> Skipping Cloudflare purge (set CF_API_TOKEN and CF_ZONE_ID in .env to enable)"
fi

echo "==> Frontend deploy complete: ${APP_VERSION} (${GIT_SHA})"
