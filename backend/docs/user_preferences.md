# User onboarding guide preferences

## Purpose

`/api/v1/preferences/dashboard-sidebar-guide` persists the authenticated user's
completion state for the dashboard sidebar onboarding guide. The route is intentionally
narrow: it supports only the canonical `dashboard_sidebar_guide` key and is not a
general key/value preference API.

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

## Persistence

`user_onboarding_guide_preferences` has one row per `user_id` plus `guide_key`.
Both the guide key and state use PostgreSQL enums, and the unique constraint prevents
duplicate state rows for a user and guide. Deleting a user cascades to their saved guide
preferences.

Apply the schema change from `backend/`:

```bash
alembic upgrade head
```
