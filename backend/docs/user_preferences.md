# User onboarding guide preferences

## Purpose

`/api/v1/preferences/dashboard-sidebar-guide` persists the authenticated user's
completion state for the desktop dashboard onboarding guide (mascot tour). The route is
intentionally narrow: it supports only the canonical `dashboard_sidebar_guide` key and is
not a general key/value preference API.

`/api/v1/preferences/dashboard-mobile-guide` mirrors the same contract for the mobile
dashboard introduction (`dashboard_mobile_intro`). Desktop and mobile guide completion
states are stored independently.

## API behavior

* `GET` returns `state: null` when the user has never acted on the guide. Consumers
  should treat this as not completed or dismissed.
* `PUT` accepts exactly one typed state: `COMPLETED` or `DISMISSED`.
* A write creates the user/key row if absent and replaces its state if present.
* The service derives `user_id` from the authenticated request context; no user id is
  accepted in the URL, query, or body.

## Frontend orchestration (desktop + mobile)

Implementation lives under `frontend/features/guide/`. The backend only stores
**completion/dismissal** for signed-in users; guests and all session-scoped behavior are
handled in the browser.

### Surfaces and versions

| Surface | Config version | Backend `guide_key` | Step count |
|--------|----------------|---------------------|------------|
| Desktop (`>1023px`) | `DASHBOARD_SIDEBAR_GUIDE_VERSION` = 2 | `dashboard_sidebar_guide` | 13 (welcome + 4 widgets + sidebar intro + 7 nav) |
| Mobile (`≤1023px`) | `DASHBOARD_MOBILE_GUIDE_VERSION` = 1 | `dashboard_mobile_intro` | 5 |

Completing or dismissing one surface does not affect the other.

### Local persistence

* **localStorage** — per-surface preference records (`smart-stock-guide-dashboard-sidebar-v2`,
  `smart-stock-guide-mobile-intro-v1`): `autoStartShown`, skip/complete/dismiss status,
  nudge counts, launcher prominence window.
* **sessionStorage** — per-surface auto-start attempt flag
  (`smart-stock-guide-dashboard-auto-started-v2`, `smart-stock-guide-mobile-auto-started-v1`):
  prevents scheduling another auto-start in the same tab session after a successful auto-start
  or after the user interacts during the pre-show delay (see below).

### Auto-start rules (`use-dashboard-sidebar-guide-controller.ts`)

1. Only on dashboard routes (`/` or `/dashboard`), after preference `gate.ready` (guest: immediate; authenticated:
   after server sync or timeout).
2. Desktop auto-start does **not** wait for market-pulse data. The welcome step is dim-only
   and shows immediately; pulse readiness is enforced only on the `market-pulse` step (Next
   disabled until the target has `data-guide-ready="true"`).
3. When auto-start is scheduled, a **500ms activity guard** runs immediately before show.
   Only trusted `pointerdown` / `keydown` events count (not scroll/wheel). Interaction during
   that window:
   * Skips auto-start for this visit.
   * Calls `markGuideAutoStartedThisSession` so revisiting `/dashboard` in the same session
     does not retrigger auto-start.
   * Does **not** call `markGuideAutoStartShown`, so the header mascot launcher remains
     prominent and the user can start the tour manually.
4. Successful auto-start marks both session and `autoStartShown` in local storage.

### Desktop sidebar expansion

When the desktop tour reaches `sidebar-introduction` (index
`DASHBOARD_GUIDE_SIDEBAR_EXPAND_STEP_INDEX`, last dashboard-phase step), a collapsed
sidebar is expanded so the guide highlights the full navigation menu, not the minimized
rail.

### Phase 1 UX fixes (2026-07)

* Mobile overlay interaction blocker (mirrors desktop `product-guide-interaction-layer`).
* Mobile welcome sheet: flex layout with sticky actions and safe-area padding.
* Drawer lifecycle during mobile tour: `guideActive` disables backdrop/Escape close; shell
  `onClose` clears both manual and guide-owned drawer flags.

Deferred to a later phase: config-driven mobile `openDrawer`, desktop mid-tour skeleton
hold for all widget steps, controller integration tests.

### Troubleshooting (tour does not auto-start)

Auto-start is intentionally one-shot per surface. It will **not** fire when:

* `localStorage` already has `autoStartShown: true` or any `status` (skipped/completed/dismissed)
  for that surface — common after prior dev testing. Clear keys
  `smart-stock-guide-dashboard-sidebar-v2` and/or `smart-stock-guide-mobile-intro-v1`, or use a
  fresh incognito window.
* `sessionStorage` has the per-session auto-start flag after a suppressed or completed attempt in
  the same tab.
* The authenticated API returns `COMPLETED` or `DISMISSED` for that guide key.

Manual replay always works via the header mascot button (`গাইড ট্যুর শুরু করুন`) unless the guide
was hard-dismissed with “do not show again” checked.

## Persistence

`user_onboarding_guide_preferences` has one row per `user_id` plus `guide_key`.
Both the guide key and state use PostgreSQL enums, and the unique constraint prevents
duplicate state rows for a user and guide. Deleting a user cascades to their saved guide
preferences.

Apply the schema change from `backend/`:

```bash
alembic upgrade head
```
