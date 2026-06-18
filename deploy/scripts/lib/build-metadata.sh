#!/usr/bin/env bash
# shellcheck disable=SC2034
# Sets APP_VERSION, GIT_SHA, and BUILD_TIME for docker compose build args.
# Source from deploy scripts: source deploy/scripts/lib/build-metadata.sh && build_metadata

normalize_public_git_sha() {
  local sha="${1:-}"
  sha="${sha//[[:space:]]/}"
  case "$sha" in
    "" | unknown | local) echo "${sha:-unknown}"; return ;;
  esac
  if [[ "$sha" =~ ^[0-9a-fA-F]+$ ]]; then
    printf '%s\n' "${sha:0:7}" | tr 'A-F' 'a-f'
    return
  fi
  echo "$sha"
}

build_metadata() {
  if [ -z "${GIT_SHA:-}" ]; then
    if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      GIT_SHA="$(git rev-parse --short=7 HEAD)"
    else
      GIT_SHA="unknown"
    fi
  fi
  GIT_SHA="$(normalize_public_git_sha "$GIT_SHA")"

  if [ -z "${BUILD_TIME:-}" ]; then
    BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  fi

  if [ -z "${APP_VERSION:-}" ]; then
    local day counter_file counter
    day="$(date -u +%Y.%m.%d)"
    counter_file="${DEPLOY_COUNTER_DIR:-deploy}/.deploy-counter-${day}"
    if [ -f "$counter_file" ]; then
      counter="$(cat "$counter_file")"
      counter=$((counter + 1))
    else
      counter=1
    fi
    mkdir -p "$(dirname "$counter_file")"
    echo "$counter" > "$counter_file"
    APP_VERSION="${day}.${counter}"
  fi

  export APP_VERSION GIT_SHA BUILD_TIME
}
