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
| Partial rollout | OK — unlocalized pages show English without errors |

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

### Where to edit text today

| Concern | File |
|---------|------|
| Cookie, type, default locale | `frontend/lib/locale/app-locale.ts` |
| Dashboard UI copy | `frontend/features/market-dashboard/dashboard-language.ts` |
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

Only the dashboard (+ guide when on home) fully consume `locale` today. Other routes (`/market-pulse`, `/stocks`, `/wealth`, …) ignore the cookie and show English. **No errors** — that is by design until each feature adds a dictionary.

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

Set `lang={locale}` on modal/dialog surfaces (guide bubble, mobile sheet, nudge). Do not set `lang` on the whole dashboard root; section-level language is enough for mixed English/Bangla content.

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

## Example: localizing `/market-pulse` (outline)

1. Add `frontend/features/market-pulse/market-pulse-language.ts`.
2. In `market-pulse-page-shell.tsx`: read cookie, pass `locale` to `MarketPulseView`.
3. In `market-pulse-view.tsx`: `const language = getMarketPulseLanguage(locale)`; pass `copy` to briefing sections.
4. Localize `market-briefing-section.tsx` skeletons via language props.
5. Pass `locale` to `MarketDataFreshnessBar` if shown on that page.
6. Add `market-pulse-locale.test.ts`.
7. Leave API narrative fields in English until backend supports locale.

---

## Testing

| File | Covers |
|------|--------|
| `features/market-dashboard/dashboard-locale.test.ts` | Cookie default, narratives, guide copy, localized model output |
| `features/market-dashboard/dashboard-ssr.test.ts` | SSR/hydration with dashboard payloads |

```bash
cd frontend
npm test -- --run dashboard-locale dashboard-ssr
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
| Cookie name | `app-locale.ts` → `LOCALE_COOKIE_NAME` + all server shells |

---

## Related docs

* Guide completion API (not language): [user_preferences.md](user_preferences.md)
* Dashboard API (English payloads): [market_dashboard.md](market_dashboard.md)
* Project code map: `.cursor/rules/project_context.md`
