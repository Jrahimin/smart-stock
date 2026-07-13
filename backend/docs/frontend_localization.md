# Frontend localization (Bangla / English)

Single reference for how Smart Stock localizes the UI, and how to extend the same pattern to **any page** (Market Pulse, Wealth, Scanner, etc.).

---

## At a glance

| Topic | Decision |
|-------|----------|
| Locales | `en`, `bn` |
| Default | `bn` (missing/invalid cookie → Bangla) |
| Storage | Browser cookie `smart-stock-locale` |
| Framework | **None** — no `next-intl`, no React context, no `/bn/...` routes |
| Scope | Feature-local typed dictionaries + `locale` prop |
| Backend text | Stays English (`reason`, `description`, etc.) |
| Partial rollout | OK — unlocalized routes (e.g. `/wealth`, stock explorer list) show English until wired |

---

## Reference files for new page conversions

Read these before implementing a new localized route. **Technical wiring** and **copy taste** are split on purpose.

### Technical pattern (minimal → full)

| Order | File | Why |
|-------|------|-----|
| 1 | `backend/docs/frontend_localization.md` | Checklist, edge cases, tests (this doc) |
| 2 | `frontend/lib/locale/app-locale.ts` | Cookie, `AppLocale`, `DEFAULT_LOCALE` |
| 3 | `frontend/app/layout.tsx` | Root `<html lang>` from cookie |
| 4 | `frontend/features/scanner/scanner-page-shell.tsx` | **Smallest** server shell — cookie → `locale` prop |
| 5 | `frontend/features/scanner/scanner-workspace-view.tsx` | Client view — `getScannerLanguage(locale)` |
| 6 | `frontend/features/market-dashboard/dashboard-page-shell.tsx` | Full shell with data hydration (dashboard) |
| 7 | `frontend/components/layout/workspace-page-hero.tsx` | Hero + optional `DashboardLocaleSwitcher` |
| 8 | `frontend/features/market-dashboard/components/dashboard-locale-switcher.tsx` | Cookie write + `router.refresh()` |

**New feature files to add:** `features/<feature>/<feature>-language.ts`, `<feature>-page-shell.tsx`, `<feature>-locale.test.ts`; wire `app/<route>/page.tsx` to the shell.

### Copy taste samples (read `bn` branches)

Casual Bangla, mixed trading terms (BUY, RSI, Volume, FDR, etc.), Western digits — match these, do not invent a new voice.

| Sample | File | Good for |
|--------|------|----------|
| **Start here** | `frontend/features/scanner/scanner-language.ts` | New hub pages with titles, filters, empty states |
| Signals / tables | `frontend/features/signals/signals-language.ts` | Filters, row labels, loading/error copy |
| Briefing / narrative | `frontend/features/market-pulse/market-pulse-language.ts` | Multi-section prose, chips by stable id |
| Full product voice | `frontend/features/market-dashboard/dashboard-language.ts` | Panels, narratives, insights, guide-adjacent copy |
| Stock detail chrome | `frontend/features/stock-workspace/stock-workspace-language.ts` | Section nav, panels, related groups |
| API overlay by code | `frontend/features/stock-workspace/stock-decision-language.ts` | Backend English + stable `code` → Bangla |

### View-model overlay (backend stays English)

| Pattern | File |
|---------|------|
| Apply overlay at end of build | `frontend/features/market-pulse/view-models/market-pulse-view-model.ts` → `applyMarketPulseLocalization` |
| Semantic keys, not English strings | `frontend/features/market-dashboard/view-models/market-dashboard-view-model.ts` |
| Warnings / signals by `code` | `frontend/features/stock-workspace/view-models/stock-decision-view-model.ts` + `stock-decision-language.ts` |

### Routes not localized yet (2026-07)

`/wealth` and sub-routes (`/wealth/snapshot`, `/wealth/calendar`, `/wealth/tools/*`, `/wealth/compare/*`) — strings live in `frontend/features/wealth/` (start with `wealth-workspace-view.tsx`, `catalog/wealth-catalog.ts`). Stock explorer list (`/stocks`) is still English-only.

---

## Quick start: localize a new page

Use this checklist when adding Bangla/English to a feature (e.g. `/market-pulse`, `/wealth`).

### 1. Create the language dictionary

`frontend/features/<feature>/<feature>-language.ts`

- Export a `FeatureLanguage` type.
- Export `const featureLanguage = { en: {…}, bn: {…} } as const satisfies Record<AppLocale, FeatureLanguage>`.
- Export `getFeatureLanguage(locale)` with `DEFAULT_LOCALE` fallback.
- Put **all** user-facing strings here (labels, empty states, skeletons, errors, aria text).
- Use **functions** for interpolated copy: `(count: number) => \`…${count}…\``.

### 2. Read locale on the server

In the feature’s **async server shell** (same pattern as dashboard):

```ts
// frontend/features/<feature>/<feature>-page-shell.tsx
import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";

export async function FeaturePageShell() {
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return <FeatureView locale={locale} … />;
}
```

Wire the shell from `frontend/app/<route>/page.tsx`.  
**Do not** use a server action, Zustand, or a global provider for locale.

### 3. Resolve copy once in the client view

```ts
// frontend/features/<feature>/<feature>-view.tsx
"use client";

import { getFeatureLanguage } from "./<feature>-language";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

export function FeatureView({ locale = DEFAULT_LOCALE }: { locale?: AppLocale }) {
  const language = getFeatureLanguage(locale);

  return (
    <section aria-label={language.hero.ariaLabel}>
      <h1>{language.hero.title}</h1>
      …
    </section>
  );
}
```

- Pass `locale` from the server shell **always** (client default is only a safety net).
- Pass **resolved strings** (or small `copy` objects) into children — not the whole `locale` tree via context.

### 4. Localize data models (if any)

If the feature builds view-models from API data:

1. Build the model in **English** (canonical, testable).
2. Add **semantic fields** (`kind`, `status`, `narrativeKey`) — never localize by matching display strings.
3. Apply `applyFeatureLocalization(model, locale, context)` at the end.
4. Early-return for `en` if English is the canonical build output (see dashboard).

### 5. Loading / skeleton / empty states

- Add `skeletons`, `states`, `empty` sections to the language file.
- Skeleton components take `copy` props — no hardcoded English in `*-skeleton.tsx`.
- For `next/dynamic` chunk loading, create the dynamic import **inside** the view with `useMemo` so the `loading` fallback can use `language` (see dashboard heatmap/sidebar).

### 6. Shared layout widgets

If the page uses `MarketDataFreshnessBar`, `DashboardGuideLauncher`, etc., pass `locale={locale}` so they pick up localized copy. Without `locale`, they intentionally stay English.

### 7. Locale switcher (optional)

Reuse the dashboard pattern: `writeAppLocaleCookie` + `router.refresh()`.  
Reference: `frontend/features/market-dashboard/components/dashboard-locale-switcher.tsx`.  
A global switcher in `TerminalAppShell` can be added later; today the toggle lives on the dashboard header but the **cookie is app-wide**.

### 8. Tests

Add `frontend/features/<feature>/<feature>-locale.test.ts`:

- `parseAppLocale` / default locale
- Both `en` and `bn` branches exist for new keys
- At least one **rendered** localized output (view-model or resolver → dictionary), not only unused helpers

Run: `cd frontend && npm test -- --run <feature>-locale`

---

## Architecture

### Data flow

```text
┌─────────────────────────────────────────────────────────────┐
│  Browser cookie: smart-stock-locale=en|bn                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
         Server Component   │   Client (switcher)
         page shell         │   writeAppLocaleCookie()
         cookies() + parse  │   router.refresh()
                            │
                            ▼
              locale: AppLocale  (prop, not context)
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
  getFeatureLanguage   buildModel({ locale })   shared widgets
  (once in view)       applyFeatureLocalization  (optional locale)
         │                  │
         ▼                  ▼
  string / copy props → presentational components
```

### Layer responsibilities

| Layer | Responsibility |
|-------|----------------|
| `lib/locale/app-locale.ts` | Type, cookie name, parse/write, `DEFAULT_LOCALE` |
| `features/<feature>/<feature>-language.ts` | All feature copy (`en` / `bn`) |
| `*-page-shell.tsx` (server) | Read cookie, pass `locale` |
| `*-view.tsx` (client) | `getFeatureLanguage(locale)`, wire children |
| `view-models/*.ts` | English canonical model + semantic keys + `apply*Localization` |
| Presentational components | Receive `copy` / string props only |

### Reference implementation (dashboard)

| Piece | Path |
|-------|------|
| Cookie read | `features/market-dashboard/dashboard-page-shell.tsx` |
| Dictionary | `features/market-dashboard/dashboard-language.ts` |
| View | `features/market-dashboard/market-dashboard-view.tsx` |
| View-model | `features/market-dashboard/view-models/market-dashboard-view-model.ts` |
| Locale switcher | `features/market-dashboard/components/dashboard-locale-switcher.tsx` |
| Tests | `features/market-dashboard/dashboard-locale.test.ts` |

### Localized surfaces (2026-07)

| Route | Dictionary | Server shell |
|-------|------------|--------------|
| `/` (dashboard) | `dashboard-language.ts` | `dashboard-page-shell.tsx` |
| `/market-pulse` | `market-pulse-language.ts` | `market-pulse-page-shell.tsx` |
| `/signals` | `signals-language.ts` | `signals-page-shell.tsx` |
| `/scanner` | `scanner-language.ts` | `scanner-page-shell.tsx` |
| `/stocks/{exchange}/{symbol}` | `stock-workspace-language.ts`, `stock-decision-language.ts` | `app/stocks/[exchange]/[symbol]/page.tsx` (cookie read inline) |

Locale switcher: dashboard header, `WorkspacePageHero` on Market Pulse / Signal Center / Scanner, stock detail top bar. All write the same `smart-stock-locale` cookie + `router.refresh()`.

Backend payloads remain **English**. Market Pulse applies a frontend locale overlay to its known story headlines (tone + sector count from English headline), alert, focus-stock, leadership, and summary templates using stable alert types, focus labels, and structured values; unknown or newly added backend prose falls back to English until the API exposes semantic reason codes. Stock decision **smart warnings** (`warnings.py` codes) and decision signal chips are localized in `stock-decision-language.ts` via `applyStockDecisionLocalization` in `buildStockDecisionViewModel`. Other backend briefing narratives, decision `reasoning[]` lines, and event prose remain English until their surfaces add the same typed adapter.

---

## Shared infrastructure

### `frontend/lib/locale/app-locale.ts`

| Export | Role |
|--------|------|
| `AppLocale` | `"en" \| "bn"` |
| `LOCALE_COOKIE_NAME` | `"smart-stock-locale"` |
| `DEFAULT_LOCALE` | `"bn"` |
| `parseAppLocale(value)` | Valid cookie → locale; else `DEFAULT_LOCALE` |
| `writeAppLocaleCookie(locale)` | Client-only; 1-year cookie, `path=/`, `SameSite=Lax` |

**Adding a third locale:** extend `AppLocale`, `SUPPORTED_LOCALES`, and every feature dictionary’s `en` / `bn` object (add a third branch). There is no central message catalog.

### Locale switcher contract

1. `writeAppLocaleCookie(nextLocale)`
2. `router.refresh()` — server shell re-reads cookie and re-renders

No full page navigation, no server action, no `window.location` reload.

---

## Feature dictionary pattern

### Type shape

```ts
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

export type FeatureLanguage = {
  hero: { title: string; ariaLabel: string };
  states: { loading: string; error: string };
  empty: { title: string; description: string };
  // use functions when copy embeds numbers from the model:
  itemCount: (n: number) => string;
};

const featureLanguage = {
  en: { … },
  bn: { … },
} as const satisfies Record<AppLocale, FeatureLanguage>;

export function getFeatureLanguage(locale: AppLocale): FeatureLanguage {
  return featureLanguage[locale] ?? featureLanguage[DEFAULT_LOCALE];
}
```

### Copy style (Bangla mode)

- **Translate** section titles, helper text, narratives, empty states, guide/mascot copy.
- **Keep English** where traders expect it: DSEX, RSI, BUY/HOLD/SELL, turnover, liquidity, symbols, prices.
- **Digits:** use Western numerals (`120`) in Bangla copy — do not use Bengali digits unless product explicitly asks.
- **Typography:** headings use tight negative `letter-spacing` for Latin UI; `:lang(bn) h1–h4 { letter-spacing: normal; }` in `globals.css` prevents Bengali word spaces from visually collapsing. Root `<html lang>` comes from the locale cookie (`app/layout.tsx`).

### Where to edit text today

| Concern | File |
|---------|------|
| Cookie, type, default locale | `frontend/lib/locale/app-locale.ts` |
| Dashboard UI copy | `frontend/features/market-dashboard/dashboard-language.ts` |
| Market Pulse UI copy | `frontend/features/market-pulse/market-pulse-language.ts` |
| Stock details UI copy | `frontend/features/stock-workspace/stock-workspace-language.ts` |
| Signal Center UI copy | `frontend/features/signals/signals-language.ts` (reuses dashboard `signals.decisionReasons` for Bangla reasons) |
| Scanner UI copy | `frontend/features/scanner/scanner-language.ts` |
| Stock decision warnings / chips | `frontend/features/stock-workspace/stock-decision-language.ts` |
| Dashboard model localization | `frontend/features/market-dashboard/view-models/market-dashboard-view-model.ts` |
| Guide / mascot (all surfaces) | `frontend/features/guide/dialogs/dashboard-dialogs.ts` |
| Guide desktop steps | `frontend/features/guide/config/dashboard-sidebar-guide.ts` |
| Guide mobile steps | `frontend/features/guide/config/mobile-intro-guide.ts` |
| **Your new feature** | `frontend/features/<feature>/<feature>-language.ts` |

---

## View-model localization

### Rule: semantic keys, not display strings

**Anti-pattern (do not repeat):**

```ts
// BAD — breaks when English copy changes or locale is not English
if (metric.label === "Turnover") { … }
if (helper.includes("snapshot")) { … }
```

**Pattern:**

```ts
// GOOD — stable across locales
switch (metric.kind) {
  case "turnover":
    localized.helper =
      metric.helperKind === "latest_turnover"
        ? language.states.latestTurnover
        : language.pulse.exchangeTurnoverSnapshot;
}
```

### Dashboard semantic types (copy when needed)

| Type / field | Values | Purpose |
|--------------|--------|---------|
| `HeroMetricKind` | `market_mood`, `index`, `turnover`, `listed_stocks` | Hero strip |
| `HeroMetricHelperKind` | `breadth_summary`, `index_unavailable`, `latest_turnover`, … | Hero helpers |
| `ExchangeMetricSource` | `exchange`, `snapshot` | Pulse turnover/volume helpers |
| `TradeDateStatus` | `available`, `awaiting` | Trade date label |
| `LeaderRowKind` | `top_sector`, `runner_up`, `top_stock`, `coverage` | Leaders rows |
| `MarketNarrativeKey` | `early_recovery`, `buyers_active`, … | Pulse insight sentences |
| `TraderDecisionReasonKey` | `buy_uptrend_reward`, `bearish_structure`, … | Smart Signals card summary (short-term prose adapter; prefer backend `reason_code`) |

Define narrative keys in the dictionary (`narratives: Record<NarrativeKey, string>`).  
Resolvers (`resolveMarketNarrativeKey`, `resolveTraderDecisionReason`, etc.) return keys only; `apply*Localization` maps key → string.

### English as canonical build

```ts
function applyFeatureLocalization(model, locale, context) {
  if (locale === "en") {
    return model; // already built in English
  }
  const language = getFeatureLanguage(locale);
  // map semantic fields → language.*
}
```

Benefits: one code path for API mapping, English tests stay simple, Bangla is an overlay.

### API + generated copy

| Source | Approach |
|--------|----------|
| Backend `reason`, `description` | Display as-is (English) in most surfaces |
| **Dashboard Smart Signals `reason`** | **Exception:** map known `scoring.py` summary lines via `reasonKey` + `dashboard-language.ts` (`decisionReasons`). Unknown keys keep the raw backend English `reasonSummary`. Long-term: backend should expose `reason_code` + typed params instead of prose matching. |
| **Dashboard Insights sidebar** | **Exception:** localize by stable insight `id` (`market-mood`, `signal-coverage`, `turnover-context`, `partial-data`) in `applyDashboardLocalization` via `dashboard-language.ts` `insights.blocks`. Unknown ids keep backend English title/description. |
| Frontend-generated snippets (e.g. `Opportunity 72`) | Keep as English market terms, or add a dedicated dictionary key — do not ad-hoc translate in components |
| Dates / relative time | English for now unless you add locale-aware formatters |

---

## Edge cases and decisions (read before implementing)

### 1. Partial localization is safe

Dashboard, Market Pulse, Signal Center, Scanner, and Stock Details consume `locale` today. Other routes (`/wealth`, `/stocks` explorer list, …) ignore the cookie and show English. **No errors** — that is by design until each feature adds a dictionary. **New client-facing routes should ship with localization** — see `.cursor/rules/architecture.md`.

### 2. Always pass `locale` from the server boundary

Client views may default `locale = DEFAULT_LOCALE`, but every server shell should pass the parsed cookie value. Otherwise a mismatched client subtree could show Bangla defaults while the rest of the app is English.

### 3. No global provider

`locale` is a prop threaded through shells and views. Cross-cutting UI (guide on home) receives `dashboardLocale` from `TerminalAppShell`, which gets it from `DashboardPageShell` — not from a React context.

### 4. SSR and hydration

- Locale is chosen on the **server** for the initial HTML.
- Client switcher updates cookie + `refresh()`; no client-only locale state that diverges on first paint.
- Do not read `document.cookie` for initial render in client-only pages without a server shell.

### 5. Dynamic imports and skeletons

Module-level `dynamic(..., { loading: () => <Skeleton /> })` cannot see `language` from the view.  
**Fix:** define `dynamic` inside the view with `useMemo(..., [language.section.eyebrow, …])` so chunk-loading fallbacks are localized.

### 6. Shared components with optional `locale`

`MarketDataFreshnessBar` uses inline English when `locale` is omitted; with `locale`, it uses `getDashboardLanguage(locale).freshness` and appends `states.staleDisclaimer` to the tooltip.

When localizing a new page that uses shared widgets:

- Pass `locale` if the widget already supports it.
- If not, either add optional `locale` + dictionary keys, or accept English for that widget until extended.

### 7. Guide is locale-aware on home only

`TerminalAppShell` passes `dashboardLocale` into `DashboardSidebarGuide` → desktop/mobile guides, nudge, launcher. Guide components require `controls` + `locale` — **no** embedded Bangla fallbacks in `guide-dialog-bubble.tsx`.  
Guide **preference** (completed/dismissed) is separate from language — see [user_preferences.md](user_preferences.md).

### 8. Accessibility

Set `lang={locale}` on modal/dialog surfaces (guide bubble, mobile sheet, nudge). Root `<html lang>` is set from the locale cookie in `app/layout.tsx` (and synced client-side in `TerminalAppShell` after switcher changes).

### 9. Tests must assert rendered behavior

Test that `buildFeatureModel(…, { locale: "bn" })` produces copy from `getFeatureLanguage("bn")`, not only that a resolver function exists in isolation. (We fixed a bug where `resolveMarketNarrativeKey` was tested but breadth insight used a different resolver.)

### 10. What we explicitly avoided

| Avoided | Why |
|---------|-----|
| `next-intl` / `react-i18next` | Scope is small; feature dictionaries are enough |
| React context for messages | Forces re-renders; harder to trace copy |
| Server actions for cookie | Client cookie + `refresh()` is sufficient |
| Route prefixes `/en/...` | SEO and routing complexity |
| `lang={locale}` on page root | Mixed EN/BN tickers and terms |
| Matching English strings in view-models | Brittle; use semantic keys |
| Bangla fallback objects inside components | Hides missing wiring; pass `controls` / `copy` explicitly |

---

## Guide localization (dashboard)

Copy lives in `frontend/features/guide/dialogs/dashboard-dialogs.ts`:

| Export | Content |
|--------|---------|
| `getDashboardGuideDialogs(locale)` | Desktop dashboard-phase mascot |
| `getSidebarGuideDialogs(locale)` | Sidebar nav-phase mascot |
| `getMobileIntroDialogs(locale)` | Mobile intro steps |
| `getGuideControls(locale)` | Buttons, skip confirm, phase labels |
| `getGuideNudgeCopy(locale)` | Pre-tour nudge |
| `getGuideLauncherCopy(locale)` | Mascot button aria/title |

Step **targets** (selectors, order) stay in `dashboard-sidebar-guide.ts` / `mobile-intro-guide.ts`; step **text** stays in `dashboard-dialogs.ts`.

---

## Example: localizing `/wealth` (outline)

Not implemented yet — use Scanner as the wiring template and Wealth catalog for string inventory.

1. Add `frontend/features/wealth/wealth-language.ts` (hero, sub-nav, tool labels — move copy out of `catalog/wealth-catalog.ts` or localize by stable id).
2. Add `frontend/features/wealth/wealth-page-shell.tsx`; wire all `frontend/app/wealth/**/page.tsx` routes.
3. Pass `locale` through `WealthWorkspaceView`, `money-snapshot-dashboard-view.tsx`, tool workspaces under `components/`.
4. Add `wealth-locale.test.ts`.
5. Backend seasonal/insight payloads can stay English until semantic keys exist.

---

## Example: localizing `/market-pulse` (outline)

Implemented — see `market-pulse-language.ts`, `market-pulse-page-shell.tsx`, `market-pulse-locale.test.ts`.

1. Add `frontend/features/market-pulse/market-pulse-language.ts`.
2. In `market-pulse-page-shell.tsx`: read cookie, pass `locale` to `MarketPulseView`.
3. In `market-pulse-view.tsx`: `const language = getMarketPulseLanguage(locale)`; pass `copy` to briefing sections.
4. Localize `market-briefing-section.tsx` skeletons via language props.
5. Pass `locale` to `MarketDataFreshnessBar` and `WorkspacePageHero` (locale switcher).
6. Chip labels: stable chip `id` → `language.chips` (`localizePulseBriefingChips`).
7. Add `market-pulse-locale.test.ts`.
8. Leave API narrative fields in English until backend supports locale.

---

## Testing

| File | Covers |
|------|--------|
| `features/market-dashboard/dashboard-locale.test.ts` | Cookie default, narratives, guide copy, localized model output |
| `features/market-dashboard/dashboard-ssr.test.ts` | SSR/hydration with dashboard payloads |
| `features/market-pulse/market-pulse-locale.test.ts` | Pulse dictionary, chip localization |
| `features/signals/signals-locale.test.ts` | Signal Center copy, localized decision reasons |
| `features/scanner/scanner-locale.test.ts` | Scanner hero, filters, category titles/descriptions |
| `features/stock-workspace/stock-workspace-locale.test.ts` | Section nav, snapshot labels, related groups |
| `features/stock-workspace/stock-decision-locale.test.ts` | Decision signals, smart warnings, score/risk labels |

```bash
cd frontend
npm test -- --run dashboard-locale dashboard-ssr market-pulse-locale signals-locale scanner-locale stock-workspace-locale stock-decision-locale
```

**Per new feature**, add tests for:

- Dictionary keys present in both `en` and `bn`
- `getFeatureLanguage("bn")` returns expected snippet
- View-model or view output uses narrative/resolver → dictionary (integration)

---

## Operational cheat sheet

| Change | Edit |
|--------|------|
| Default language for new visitors | `app-locale.ts` → `DEFAULT_LOCALE` |
| Dashboard panel title (Bangla) | `dashboard-language.ts` → section → `bn` |
| Market mood narrative | `dashboard-language.ts` → `narratives.<key>` + view-model resolver |
| Mascot welcome (desktop) | `dashboard-dialogs.ts` → `dashboardGuideDialogsBn` |
| Mobile intro text | `dashboard-dialogs.ts` → `mobileIntroDialogsBn` |
| Guide button / nudge | `dashboard-dialogs.ts` → `guideLauncherBn` / `guideNudgeBn` |
| New feature string | `features/<feature>/<feature>-language.ts` |
| Market Pulse panel title (Bangla) | `market-pulse-language.ts` → section → `bn` |
| Stock detail section nav | `stock-workspace-language.ts` → `sections` |
| Stock smart warnings / decision chips | `stock-decision-language.ts` → `warnings` / `signals` by stable `code` |
| Market Pulse story headline | `market-pulse-language.ts` → `briefing.storyHeadline(tone, sectorCount)` |
| Signal Center filters | `signals-language.ts` → `filters` |
| Cookie name | `app-locale.ts` → `LOCALE_COOKIE_NAME` + all server shells |

---

## Related docs

* Architecture rule (localization in scope for new pages): `.cursor/rules/architecture.md`
* Guide completion API (not language): [user_preferences.md](user_preferences.md)
* Dashboard API (English payloads): [market_dashboard.md](market_dashboard.md)
* Project code map: `.cursor/rules/project_context.md`
