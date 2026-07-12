# Cloudflare cache rules — Smart Stock

Apply these in **Cloudflare Dashboard → Caching → Cache Rules** (or Page Rules on older plans).

Goal: cache immutable Next.js assets at the edge, never cache HTML/RSC or API responses.

**Browser-side market cache** (IndexedDB + TanStack Query) is independent of Cloudflare — generation-aware validation and sync coordinator behavior are documented in `backend/docs/market_caching.md`. Deploying a new frontend JS bundle does not require a Cloudflare purge for market data freshness; purges only affect edge-cached static assets.

---

## Rule 1 — Cache Next.js static assets

| Field | Value |
|-------|--------|
| **Rule name** | Cache Next.js static |
| **When** | Hostname equals `stockwealthbd.com` **AND** URI Path starts with `/_next/static/` |
| **Then** | Cache eligibility: **Eligible for cache** |
| | Edge TTL: **1 year** (or respect origin `Cache-Control`) |
| | Browser TTL: **Respect origin** |

Next.js serves `Cache-Control: public, max-age=31536000, immutable` on hashed chunks. Cloudflare should cache these (`cf-cache-status: HIT`).

---

## Rule 2 — Bypass HTML and RSC on the frontend host

| Field | Value |
|-------|--------|
| **Rule name** | Bypass frontend HTML and RSC |
| **When** | Hostname equals `stockwealthbd.com` **AND** (URI Path does not start with `/_next/static/` **AND** URI Path does not start with `/_next/image/`) |
| **Then** | Cache eligibility: **Bypass cache** |

This covers `/`, `/dashboard`, `/market-pulse`, and `?_rsc=` prefetch requests.

Optional narrower RSC rule (if you prefer two rules):

- When: Hostname equals `stockwealthbd.com` **AND** Query string contains `_rsc`
- Then: Bypass cache

---

## Rule 3 — Bypass API hostname

| Field | Value |
|-------|--------|
| **Rule name** | Bypass API |
| **When** | Hostname equals `api.stockwealthbd.com` |
| **Then** | Cache eligibility: **Bypass cache** |

All `/api/v1/*` responses must be dynamic.

---

## Rule 4 — Bypass build metadata (recommended)

| Field | Value |
|-------|--------|
| **Rule name** | Bypass build-info |
| **When** | Hostname equals `stockwealthbd.com` **AND** URI Path equals `/build-info.json` |
| **Then** | Cache eligibility: **Bypass cache** |

The origin already sends `Cache-Control: no-store`; this rule is defense in depth.

---

## API token for deploy-time purge

Create a token in **My Profile → API Tokens** with:

- Permissions: **Zone → Cache Purge → Purge**
- Zone Resources: include `stockwealthbd.com`

Add to root `.env` on the VPS:

```bash
CF_API_TOKEN=your-token
CF_ZONE_ID=your-zone-id
```

`deploy/scripts/deploy-frontend.sh` and `deploy/scripts/deploy.sh` call `purge-cloudflare-cache.sh` automatically when these are set.

Find zone ID: **Cloudflare Dashboard → stockwealthbd.com → Overview → API** (right column).

---

## Verify after applying rules

```bash
# HTML — should be DYNAMIC
curl -sI https://stockwealthbd.com/dashboard | grep -i cf-cache-status

# Static CSS — should be HIT after first request
curl -sI "https://stockwealthbd.com/_next/static/chunks/$(curl -s https://stockwealthbd.com/build-info.json >/dev/null; curl -s https://stockwealthbd.com/dashboard | grep -o '/_next/static/chunks/[^\"]*\.css' | head -1 | xargs basename)" | grep -i cf-cache-status

# API — should be DYNAMIC
curl -sI https://api.stockwealthbd.com/api/v1/system | grep -i cf-cache-status

# Build info — should be DYNAMIC
curl -sI https://stockwealthbd.com/build-info.json | grep -i cf-cache-status
```

---

## Deploy workflow

```bash
# Frontend-only (CSS/JS/UI changes)
bash deploy/scripts/deploy-frontend.sh

# Full stack (backend + frontend + migrations)
bash deploy/scripts/deploy.sh
```

Check deployed version:

```bash
curl -s https://api.stockwealthbd.com/api/v1/system | jq .data
curl -s https://stockwealthbd.com/build-info.json | jq .
```

Both should report the same `version`, `git_sha`, and `build_time` when deployed together via `deploy.sh`.
