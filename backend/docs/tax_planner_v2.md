# Tax Planner V2

The v2 backend estimates Bangladesh resident individual tax using one active, administrator-published rule revision. Visitors do not select an assessment year or purpose. Publishing a reviewed yearly update or amendment activates it for everyone. [Current operating model](tax_planner_active_calculator.md) · [Implementation plan](tax_planner_final_three_phase_plan.md) · [Forward-year source verification](tax_planner_2027_28_rule_sources.md)

## Current backend design

`tax_planner_rule_revisions` stores a complete, validated JSONB rules snapshot with its assessment year, income dates, source references, policy version, content hash and publication history. Each year has at most one open draft and one published revision. Published snapshots are immutable. Publication supersedes the old revision and activates the previewed draft in one transaction.

The engine calculates the base estimate and optional scenario from the most recently published revision across all years. The result separates annual liability from supported filing settlement and reports missing facts when a case needs review. Missing or invalid active rules return `503 TAX_RULES_UNAVAILABLE`. A calculation using an older revision ID returns `409 RULESET_CHANGED` so the client can refresh current configuration without losing entered facts. Historical snapshots remain in admin for audit and recovery.

| Responsibility | Current backend |
| --- | --- |
| Calculation policy | The engine owns income classification, qualification, cap application, tax bands, rebate and settlement arithmetic. |
| Rules and presentation | Each snapshot contains the applicable rates, thresholds, limits, filing windows, category presentation and legal source references. Category visibility affects presentation only. |
| Admin workflow | Admins can read revisions and history. Super admins can create and edit drafts, compare preview results and publish a reviewed revision. |
| Recovery | Copy a verified historical snapshot into a new draft. If a saved draft is open, a super admin can confirm an audited, version-checked replacement without affecting the published rules. Preview and publish the replacement separately. |

The public endpoints are `GET /api/v1/wealth/tax-planner/v2/config` and `POST /api/v1/wealth/tax-planner/v2/calculate`. The admin revision workflow is under `/api/v1/admin/tax-planner/v2`. The rollout guide documents request fields, release flags and isolated acceptance commands. [Backend rollout guide](tax_planner_backend_rollout.md)

Scope questions start at “Not sure.” Quick and Detailed share the same conditional annual planning estimate: unanswered special-case scope is assumed not to apply, with the ordinary taxpayer minimum and the gross-salary example's benefit-valuation assumption. These request-only assumptions never become saved confirmations. Explicit special cases, unresolved source/category eligibility and filing estimates retain their review requirements. The supported financial-income entries separate gross receipts, qualifying source expenses, and actual withholding. Source links distinguish the audited PDF edition from the public edition and use page anchors only when verified. [Official financial-expense guidance, PDF page 61](https://nbr.gov.bd/uploads/news-scroller/Aykor_Nirdashikha_2026-2027_BG_Press_Modify_Copy.pdf#page=61)

## Prepare a release

Rehearse export, migration, staging and publication in an isolated staging database. Repeat the procedure separately for the authorized target. Each environment supplies its own legacy export, archive and revision IDs.

1. Keep `TAX_PLANNER_V2_RELEASE_ENABLED=false`. Select the migration database explicitly and export its legacy settings with `python -m app.scripts.tax_planner_rule_rollout export --output <new-export-file>`.
2. Apply `python -m alembic upgrade head` against the same database. The additive migration creates the revisions table and retains the three legacy tables.
3. Run `python -m app.scripts.tax_planner_rule_rollout archive-and-stage --legacy-export <export-file>`. The command reconciles the target rows with the export, archives the legacy settings and stages the verified source drafts for both years. Review the archive hash and draft IDs.
4. Preview drafts through the admin API and review their source checks and calculation differences. Publish the intended current rules last: the latest publication becomes the single active public calculator. Admin publication is available while public v2 remains dormant.
5. Coordinate public enablement with the frontend. Verify the intended active pack and expected revision ID as part of cutover. [Detailed rollout procedure](tax_planner_backend_rollout.md)

## Legacy calculator and historical design

The following global tables served the earlier calculator and remain available for legacy operation before cutover and for reconciliation.

| Legacy table | Historical purpose |
| --- | --- |
| `tax_planner_settings` | Global display metadata, profile thresholds, rebate and location minimum amounts. |
| `tax_slabs` | Global progressive tax bands, including a stored allowance band. |
| `tax_investment_categories` | Global category labels, display order and enabled settings. |

The legacy admin wrote these settings directly. `TaxConfigResolver` used a process-local cache and could use `bangladesh_tax_config.py` when database settings or slabs were missing. The legacy seed, `python -m app.scripts.seed_tax_planner_config`, inserts missing legacy rows. The current v2 bootstrap uses the archive-and-stage workflow above.

At cutover the legacy public endpoints and legacy admin writes return `410 TAX_PLANNER_UPGRADE_REQUIRED`. Legacy admin reads remain available for reconciliation. [Backend rollout guide](tax_planner_backend_rollout.md)
