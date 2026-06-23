# Smart Stock Frontend

Next.js App Router scaffold for the stock analysis dashboard.

## Setup

```bash
npm install
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
npm install
Copy-Item .env.example .env.local
```

## Run

```bash
npm run dev
```

## Clean build cache

`npm run dev` writes Turbopack compilation output under `.next/` (especially `.next/dev/cache`). That folder is gitignored and safe to delete; it can grow to several GB during long local dev sessions.

Stop the dev server, then:

```bash
npm run clean
```

This removes `.next/` and `out/` (static export output, if used). The next `npm run dev` or `npm run build` recreates what it needs. The first compile after a clean may be slower.

**Production Docker does not use this path** — the frontend image ships only the standalone build (see [`backend/docs/deployment_architecture.md`](../backend/docs/deployment_architecture.md)).

## Structure

- `app`: route files and page composition
- `components/layout`: dashboard shell, sidebar, and topbar
- `components/dashboard`: dashboard-specific UI components
- `components/ui`: small reusable UI primitives
- `hooks/market`: market-domain hooks
- `lib/api`: centralized backend API client and shared API types
- `lib/frontend-config.ts`: frontend environment access

