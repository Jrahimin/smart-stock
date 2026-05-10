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

## Structure

- `app`: route files and page composition
- `components/layout`: dashboard shell, sidebar, and topbar
- `components/dashboard`: dashboard-specific UI components
- `components/ui`: small reusable UI primitives
- `hooks/market`: market-domain hooks
- `lib/api`: centralized backend API client and shared API types
- `lib/frontend-config.ts`: frontend environment access

