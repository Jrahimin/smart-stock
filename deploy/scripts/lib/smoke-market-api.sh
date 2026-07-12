#!/usr/bin/env bash
# Smoke-check critical market intelligence endpoints after deploy.
# Fails fast on HTTP errors or FastAPI 422 dependency/query validation regressions.

smoke_market_api() {
  local api_url="${1%/}"

  echo "==> Smoke: market freshness"
  curl -fsS "${api_url}/market/freshness?exchange=DSE" >/dev/null

  echo "==> Smoke: market pulse summary (anonymous)"
  local summary_body
  summary_body="$(curl -fsS "${api_url}/market/pulse/summary?exchange=DSE")"
  case "$summary_body" in
    *'"success":true'*) ;;
    *)
      echo "Unexpected /market/pulse/summary response:" >&2
      echo "$summary_body" >&2
      exit 1
      ;;
  esac

  echo "==> Smoke: dashboard overview"
  curl -fsS "${api_url}/dashboard/overview?exchange=DSE" >/dev/null

  echo "Market API smoke checks passed."
}
