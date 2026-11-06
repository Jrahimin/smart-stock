# Tax planner: one active calculator

Updated 6 November 2026. This product decision supersedes the public year and purpose selection in the earlier three-phase plan.

## Visitor experience

Visitors open the planner and calculate using the latest administrator-published rule revision. There is no assessment-year selector, filing/planning mode selector, or historical comparison. An informational badge identifies the active rules; it is not an input.

Quick estimate, the three Detailed steps (Profile, Income and Investments), annual tax, optional supported credit/settlement breakdowns, investment scenarios, animations, tooltips, calculation dialog and bilingual guide remain within the established design. The default salary example calculates immediately. Entered eligible investment totals and the simulator work without an extra consent checkbox. Unknown or unsupported facts still produce review guidance rather than invented tax figures.

The income chooser explains review-only source limitations before entry. Optional tax adjustments disables new payment entry and explains its availability when the active identity does not support filing balances; existing records remain preserved. Financial expense amount edits keep qualification, while changing the expense type requires reconfirmation. Out-of-period CZM payments show an inline exclusion with the active income dates. On mobile, Wealth navigation scrolls away to leave form space. See the consolidated browser QA report for repair evidence and remaining calculation-scope limits.

Quick and Detailed are two layouts of the same annual planning calculation. Unanswered general special-case questions use clearly labelled planning assumptions, the ordinary taxpayer minimum is assumed, and the gross-salary example assumes taxable benefits are included. Assumptions are applied only to annual requests and are never written into saved facts. Explicit special cases, unverified category eligibility and requested filing balances still need review. Switching layouts alone does not clear the snapshot or disable a usable slider.

Edits calculate after a 500 ms pause, cancel obsolete requests and keep the previous same-revision result visible with an updating label. The calculate button submits immediately. Invalid or newly published rules do not inherit an old result. Income cards retain stable positions while being filled.

The active pack supplies the rates, thresholds, investment limits, qualifications, source references and applicable income dates. The simulator uses that same revision. Publishing a different year does not erase the amounts entered in an open planner. Facts with date-specific eligibility still need to be correct for the active income period.

Detailed investment entry now defaults to an annual amount field inside each eligible category tile. `planning_category_totals` is a distinct backend input representation: it records planning assumptions, applies active shared DPS and government-securities caps, and does not fabricate dated or verified payment facts. Insurance, PF and approved-donation amounts must be the eligible portion after their category conditions. Optional individual verification retains the full earlier eligibility checks. Amount-only entries cannot establish a verified filing balance. Category amounts, one eligible total and verified contributions are alternative representations; only the selected one counts. Switching methods preserves the others, while clearing an incompatible category-specific hypothetical scenario.

The hero displays annual tax after current rebate on the left and potential additional annual saving on the right. The latter is not deducted again from the displayed annual tax. Its compact eligibility action opens the existing bilingual guide modal.

## What makes rules active

The most recently **published** revision across all years is the one public calculator. Creating, editing, saving or previewing a draft does not activate it. A calendar date or browser locale does not switch the calculator to another pack. Deliberately publishing a correction or restored revision makes that publication active, including when its assessment-year label is older.

The backend validates the active payload, policy version and content hash. If the active revision is invalid, calculation is unavailable; an older rule pack is not substituted silently. Release and calculation-suspension flags remain effective.

## Admin update workflow

1. Open `/admin/tax-planner`. The active public year and revision are shown at the top. Admin configuration retains its existing authentication and write permissions.
2. For an amendment, manage the active year and create a draft. For a new annual update, enter the consecutive assessment-year pair (for example, `2028-29`), choose **Manage year**, then **Create draft**.
3. Review the prefilled values. A future year starts from the latest published pack with newly derived July–June income dates and no copied filing calendar. This is a starting point, not verification of future law. Update legal parameters, category presentation, official sources, rule references and review metadata as needed. Add filing windows only when verified for that year.
4. Save and preview. Review configuration changes, calculation examples, invariant checks and missing legal sources. A new year requires updated `scope.individual` authority identifying the applicable year; changed legal parameters require authority for their affected rule families. Existing source examples remain regression comparisons, not a claim that future law is already known.
5. Resolve preview issues, acknowledge changed example results where requested, enter a publication reason, then **Publish revision … make active**. The public API confirmation shows which revision is now served. All visitors use that publication.

New numeric rates and thresholds supported by the engine can be managed in admin. A law introducing a new calculation formula or income treatment outside the supported policy still requires an engine change and tests; arbitrary arithmetic cannot be configured safely as a rate.

Old published payloads and immutable history remain for audit, comparison and recovery inside admin. They are not public calculator options. Existing legacy archives and saved browser data are not deleted.

## Public API

- `GET /api/v1/wealth/tax-planner/v2/config` takes no year-selection parameter. The compatible response envelope retains `selected`, `default_assessment_year` and `supported_years`, but describes exactly one active revision. The latter array contains one identity, not selectable history.
- `POST /api/v1/wealth/tax-planner/v2/calculate` takes current facts, schema version and `expected_ruleset_revision`. Public `assessment_year` and `purpose` fields are rejected. The backend chooses the active rules and current planning behavior.
- Calculation responses retain assessment-year, income dates, revision and source metadata for traceability. Internal engine requests and admin golden examples retain identity fields so their results can be reproduced. There is no public historical calculation endpoint.
- On `409 RULESET_CHANGED`, the frontend refreshes current configuration and retries the same entered facts once with the new revision. Results from different revisions are not mixed.
- Configuration and calculations remain anonymous, `no-store`, and subject to existing validation and payload limits. Admin endpoints retain authentication.

This change requires no database migration. Existing publication timestamps determine the active revision. On deployment, check the intended active pack; publish a reviewed revision through admin if the currently latest publication is not the intended one.

## Verification

Coverage includes current-only HTTP requests, active publication selection, revision conflicts, invalid active pack behavior, future-year draft/preview/publication, preserving facts during rule rollover, calculation regression cases, bilingual frontend interactions and real API-backed planner/admin journeys. Disposable database tests do not publish or edit production rules.

Local verification: 658 backend tests, 292 frontend tests, nine real API-backed journeys and TypeScript passed. Chrome verified anonymous calculation, all four Detailed steps, English/Bangla switching, automatic eligible-total updates, slider calculation and the reading dialog. The isolated local QA app serves the existing published AY 2027-28 pack as its one active calculator. No production publication or deployment was performed.
