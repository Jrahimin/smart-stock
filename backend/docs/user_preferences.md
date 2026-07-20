# User onboarding guide preferences

This document defines the persisted preference contract. For frontend journey behavior,
copy, accessibility, and troubleshooting, see [maskot_journey_guide.md](maskot_journey_guide.md).

## Contract

Authenticated guide completion is stored in `user_onboarding_guide_preferences`, keyed
by authenticated `user_id` and `guide_key`. `GET` returns `state: null` before a user has
acted; `PUT` accepts `COMPLETED` or `DISMISSED` and upserts that user's row. Guests use
browser storage only.

| Surface | GET / PUT route | `guide_key` |
|---|---|---|
| Dashboard desktop | `/api/v1/preferences/dashboard-sidebar-guide` | `dashboard_sidebar_guide` |
| Dashboard mobile | `/api/v1/preferences/dashboard-mobile-guide` | `dashboard_mobile_intro` |
| Wealth overview desktop | `/api/v1/preferences/wealth-overview-desktop-guide` | `wealth_overview_desktop_guide` |
| Wealth overview mobile | `/api/v1/preferences/wealth-overview-mobile-guide` | `wealth_overview_mobile_guide` |
| Tax Planner desktop | `/api/v1/preferences/tax-planner-desktop-guide` | `tax_planner_desktop_guide` |
| Tax Planner mobile | `/api/v1/preferences/tax-planner-mobile-guide` | `tax_planner_mobile_guide` |

All routes derive the user from authentication; callers never supply a user ID. Desktop
and mobile preferences remain independent, and the unique database constraint prevents
duplicate user/key rows. Apply changes with `cd backend && alembic upgrade head`.
