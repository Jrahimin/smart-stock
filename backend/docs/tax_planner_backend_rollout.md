# Tax planner backend rollout

The v2 calculation API serves one active snapshot: the most recently published revision across all years. Visitors do not select years or purposes. Both deployment flags default to false. Super admins can prepare, preview and publish a revision before the public switch is enabled. [Current calculator and yearly admin workflow](tax_planner_active_calculator.md)

| Deployment flag | Effect |
| --- | --- |
| `TAX_PLANNER_V2_RELEASE_ENABLED` | Enables public v2 and makes the legacy public configuration, legacy calculations and legacy admin writes return `410 TAX_PLANNER_UPGRADE_REQUIRED`. Legacy admin reads remain available for reconciliation. |
| `TAX_PLANNER_V2_CALCULATIONS_SUSPENDED` | Returns `503 TAX_CALCULATIONS_SUSPENDED` for v2 calculations and exposes the suspension in v2 configuration. This leaves the selected rule revision and history available. |

Change flags through the deployment configuration and restart the API workers. Keep the release flag off until the matching frontend is ready. A bad release can be suspended without reactivating the legacy calculator.

## Preserve and stage legacy settings

1. Select the authorized migration database explicitly. Set `TAX_PLANNER_MIGRATION_DATABASE_URL` and confirm the Alembic target is the same database.
2. Run `python -m app.scripts.tax_planner_rule_rollout export --output <new-export-file>` from the backend directory. The command uses a repeatable-read transaction and saves the three legacy tables, exact decimal strings, identifiers, timestamps, table counts and hashes, and the Alembic revision. It creates a new file. Store this operator evidence outside the published application and record the legacy admin display and resolver values separately.
3. Apply `python -m alembic upgrade head` on the selected database. Revision `a4m5n6o7p8q9` adds `tax_planner_rule_revisions` and the history guard. Revision `b5n6o7p8q9r0` adds immutable discarded-draft history. The existing tables remain available. Previously deleted historical settings are outside this archive.
4. Run `python -m app.scripts.tax_planner_rule_rollout archive-and-stage --legacy-export <export-file>`. This compares the export to a coherent read of the legacy tables, archives the unverified legacy configuration, and creates verified source drafts for AY 2026–27 and AY 2027–28 in one transaction. The staging report returns the archive hash and revision IDs. A repeated run with the same export and source packs returns the same IDs. A changed legacy export or different draft requires operator reconciliation.

The rollout utility stages drafts. Use the admin preview and publish endpoints to activate a version. The database migration is forward only and keeps version history available for recovery.

## Publish a revision

Endpoints are under `/api/v1/admin/tax-planner/v2`. Existing admin roles can list and read revisions. Super admins can create, edit, preview and publish drafts.

1. `GET /rulesets` lists draft, active and historical revisions. An optional `assessment_year` filters the list. `GET /rulesets/{id}` reads the full snapshot or archived evidence.
2. `POST /drafts` takes `assessment_year` and an optional same-year `copy_from_revision_id`. The year has one open draft. Omitting the source creates it from that year's published revision or verified source pack. A new future year is prefilled from the latest publication with derived income dates and an empty filing calendar. Review its law and update year authority before publication.
3. `PUT /drafts/{id}` takes the full `rules` object and the draft's `edit_version`. A changed content hash invalidates the prior preview. Reload and reconcile on `409 DRAFT_CONFLICT`.
4. `POST /drafts/{id}/preview` takes `edit_version`. It returns previous and proposed configuration, fixed source checkpoints, output deltas, invariant issues, and missing source rules. Address any issue before publication. Document amended legal parameters with updated references in their affected rule families.
5. `POST /drafts/{id}/publish` takes the previewed `edit_version`, `content_hash`, `expected_published_revision_id` (explicit null for a first publication), `change_reason`, and `acknowledge_fixture_deltas` when example results changed. Publication checks the same draft, comparison outputs and prior revision in one transaction and supersedes the former active revision.

To restore a verified snapshot, select the published or superseded same-year revision and copy it into a draft. If a saved draft already exists, review it first, then select **Replace draft with selected revision**, enter a reason, and confirm. `POST /drafts/{id}/discard` checks the saved draft's `edit_version` and `content_hash`, requires `confirm_discard` and `change_reason`, and accepts an optional `copy_from_revision_id`. The operation keeps the discarded payload, hash, actor, timestamp and reason. A replacement is created in the same transaction and requires a fresh preview and explicit publication. A conflict leaves the saved draft and active revision intact. The standalone **Discard saved draft** action retains the audit record without opening a replacement.

Evidence editions and hashes identify the exact audit files. A linked edition may differ; `public_edition` and `public_pdf_pages` describe the actual public PDF and its independently verified pages. The supplied 159-page guide and NBR's 177-page press guide use different page numbering. The built-in packs include verified press PDF pages 61, 69 and 77–78. When no link page has been verified, the UI opens the document without a page anchor. Update evidence in a new draft when an older pack has already been staged or published. Existing hashes remain valid, and the staging command will not overwrite a differing revision.

## Public client contract

`GET /api/v1/wealth/tax-planner/v2/config` returns exactly one active snapshot, revision identity, Dhaka date and settlement capabilities. It has no year-selection parameter. The existing `supported_years` response array contains only that active identity. Admin publication determines activation; a filing calendar or date change does not switch it.

Send the active ID as `expected_ruleset_revision` with `POST /api/v1/wealth/tax-planner/v2/calculate`. Omit `assessment_year` and `purpose`; those public input fields are rejected. Monetary fields use decimal strings. The result binds base and scenario to one revision and separates annual and settlement statuses. On `409 RULESET_CHANGED`, refresh current configuration and use the new ID when rerunning the same facts. Unavailable or invalid active rules have no fallback estimate.

For CZM, `coverage.other_part2_donation_claims` establishes whether another claim may share the aggregate donation condition. For eligible listed funds whose combined qualifying gains exceed the common exemption, `fund_excess_special_rate_confirmed` identifies a verified special rate. An unresolved fact returns structured review guidance.

For supported financial income, enter gross receipts before withholding. Optional expenses require a category, amount, and explicit confirmation under Income Tax Act sections 64–65. The engine subtracts only qualifying costs from that source and handles the actual tax withheld through the credit ledger. It screens uncertain costs and expenses exceeding gross source income for review. [NBR guide, press PDF page 61](https://nbr.gov.bd/uploads/news-scroller/Aykor_Nirdashikha_2026-2027_BG_Press_Modify_Copy.pdf#page=61).

Configuration, calculations, draft responses and validation errors use `Cache-Control: no-store`. Tax request bodies are capped at 256 KiB, with per-list limits in the request schema. Backend logs record revision, elapsed time and scope counts.

## Phase 3 frontend and cutover

The public planner stays at `/wealth/tools/tax-planner` and rule management stays at `/admin/tax-planner`. The new public screen requires published v2 rules. While the backend release flag is off or no compatible revision is available, it keeps entered facts in memory and reports that an estimate is unavailable. It does not use legacy rates. The new admin screen can prepare and publish snapshots while the public flag is off.

The public screen retains the original hero, Quick and Detailed forms, colored snapshot, investment slider and tax journey styling. Quick changes recalculate through the v2 API. The slider uses the active backend's additional eligible investment and scenario outputs with an eligibility assumption and applicable contribution date. No year/purpose selectors or historical comparison mode are shown. Detailed source fields, credits and qualifications fit inside the original cards and stepper.

1. Keep the currently deployed public frontend in service while the compatible backend is migrated and the two source drafts are prepared. On the target environment, reconcile the legacy export and confirm the saved preview, source evidence, assessment year and expected published revision before publishing.
2. Validate the new frontend and active revision together in staging. Confirm there are no public year or purpose selectors. Check the active rule hash, ordinary salary and investor examples, the distinction between annual liability and filing balance, and read-only access for admins. Use synthetic values for checks. Keep the staging and target databases separate.
3. Coordinate routing the new frontend with enabling `TAX_PLANNER_V2_RELEASE_ENABLED` on all backend workers. Compose passes through both backend flags with false defaults. Recreate affected services after changing deployment environment values so the new processes receive them. Expect v1 calculate and write clients to require refresh once v2 is active.
4. Verify the published IDs and hashes through the public API, and check the same values in results, scenarios and the guide. If an issue could affect estimates, suspend calculations while preserving the published revision; use the verified snapshot restoration workflow to correct rules.

Browser drafts are session-only unless a signed-in user saves one on the current browser. The UI keys saved facts by owner, assessment year and purpose, and now writes schema 4. On restoring schema 2, the planner asks the user to reconfirm older scope and new taxpayer “No” values. Schemas 2 and 3 also require reconfirmation of an affirmative employment benefit valuation on a Quick salary entry, because those versions recorded the same answer for automatic and manual confirmations. The salary amount, explicit negative answers and valuations on salary entries created in Detailed are preserved. Quick and Detailed share request-only assumptions for conditional annual planning, including the gross-salary example valuation; saved answers remain unchanged. Explicit source/category qualifications remain required, and filing requests send verified answers without the planning defaults. Re-enter information from the old `wealth.taxPlanner.v1` format using the correct assessment year and sources.

Local Phase 3 acceptance exercised both staged packs through preview and publication in a disposable PostgreSQL database, then the published public routes. The local browser verified the salary fixture, the closed-year investment comparison, the forward-year projection and unavailable filing state, English and Bangla amounts, and the five-step desktop and mobile guides. This does not complete target staging or production verification.

## Isolated acceptance

From the backend directory, set `TAX_PLANNER_TEST_DATABASE_URL` to a disposable PostgreSQL database on a loopback address with a name starting `tax_planner_test`. The tests create and remove unique schemas.

```powershell
& '.venv/Scripts/python.exe' -B -m pytest app/tests/test_tax_planner_v2_engine.py app/tests/test_tax_planner_v2_http_safety.py app/tests/test_tax_planner_v2_persistence.py app/tests/test_wealth_calculations.py app/tests/test_tax_planner_config.py -q -p no:cacheprovider
```

Run the API-backed React journeys separately. From the backend, with the same kind of disposable database configured, start `python -B -m app.tests.tax_planner_ui_server`. The test server binds to `127.0.0.1:8113`, seeds both years into a unique schema, and removes the schema on a graceful stop. From the frontend, set `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8113/api/v1` and run `npm run test:tax-planner-ui`. This suite drives the actual planner and admin React components against the calculation and revision APIs, including saved-draft recovery. The test server supplies synthetic authorization and a fixed date; staging still needs normal authentication and current Dhaka-time verification.
