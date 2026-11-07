# Tax configuration workspace

The admin page now separates the selected revision into seven sections: Overview, Tax rules, Investments & rebate, Filing calendar, Labels & visibility, Sources & evidence, and Review & publish. Section changes retain the same rule object; they do not save, reload, or validate it.

The sticky header distinguishes the selected year/revision from the active public calculator. New-year management and copying are secondary actions. Published, superseded, discarded and legacy revisions remain read-only. Amounts and percentages are formatted for reading; drafts use decimal inputs with explicit units and scope. Allowances, slabs, filing windows and category labels use tables. Category visibility only affects new entry choices, not legal eligibility or historical entries.

## Existing lifecycle and permissions

All operations still use `/api/v1/admin/tax-planner/v2`:

| Operation | Endpoint | Safeguards retained |
| --- | --- | --- |
| List / inspect | `GET /rulesets`, `GET /rulesets/{id}` | Existing admin read permission |
| Create draft | `POST /drafts` | Super admin; one open draft per year |
| Save draft | `PUT /drafts/{id}` | Full rule pack and edit version; success only after the write returns |
| Validate | `POST /drafts/{id}/preview` | Saved edit version, source coverage, invariants and example comparisons |
| Publish | `POST /drafts/{id}/publish` | Exact preview/hash/version, expected publication, reason and required acknowledgement |
| Discard / replace | `POST /drafts/{id}/discard` | Saved hash/version, explicit confirmation/reason and retained history |

Create draft uses the year's current publication or baseline; future years inherit the latest publication. Copy selected revision uses that exact same-year snapshot. Replacement updates the discarded revision's local cache immediately so its history is read-only when reopened.

Unsaved configuration changes warn before year/revision changes and link navigation. Accessible dialogs support Escape, safe initial focus, focus return and explicit discard. Native unload warnings protect full-page exits. Same-document Back/Forward uses the Navigation API's cancellable traversal event where supported; this was exercised in the Codex browser. Other browser engines were not tested.

Field validation links reveal the appropriate tab, clear obstructing filters, open the relevant source view and focus the field below the sticky header. Inputs expose inline descriptions and invalid state. Unsaved and error indicators identify affected sections. Save, Validate and Publish remain separate operations.

## Source editions

Document records retain their identifiers, evidence editions, public editions, URLs and fingerprints. Shared URLs never merge records. Evidence PDF pages and verified linked PDF pages remain distinct; only verified linked pages produce URL anchors. Updating a document's URL, linked edition or fingerprint still clears only that document's affected verified mappings.

Printed-page citations remain in the existing provision field. The workspace displays explicitly recorded printed-page citations separately and otherwise says **Not recorded separately**. It never derives page numbers from another edition or changes the data contract.

The supplied local `Nirdeshika_2025-26.pdf` was zero bytes, so its contents could not be reviewed. No legal rule corrections or eligibility changes were inferred from it.

## Verification — 7 November 2026

- Codex browser: desktop 1280 × 800 and mobile 390 × 844; light/dark themes; English interface and real Bangla category labels.
- Seven tabs, keyboard arrows/Home/End, active-tab visibility after resizing, wide-table keyboard and horizontal scrolling, search and hidden-category filtering.
- Published/read-only and draft states, empty assessment year, controlled revision-load failure, retry presentation and source-edition/reference views.
- Disposable API: draft retention, failed save with visible/focused inline error, successful full-pack save, validation, source-gap publication blocking, version conflicts, replacement and immutable discard history.
- Browser warnings: year selection cancellation, links, Back, Escape/focus return and explicit revision discard.
- Production public API: original AY 2026–27 revision ID and content hash confirmed unchanged. No production writes or deployment were performed.
- Temporary browser routes/proxy were removed; the loopback test service and only its uniquely identified disposable database schema were cleaned up.

Observed ratings: organization **9/10** (direct sections); clarity **8.5/10** (units, selected/active distinction and honest evidence gaps); editing efficiency **8.5/10** (persistent save and field-level recovery); visual consistency **8.5/10** (shared typography, surfaces and readable tables). Mobile comparison tables intentionally scroll horizontally.

The final API acceptance run passed **14/14** journeys. The tax frontend group passed **71/71** tests. TypeScript and the production frontend build passed; its route manifest contains the admin page and no temporary QA routes. The full frontend run passed **325 tests**, with the existing unrelated `wealth-locale.test.ts:108` tour-copy assertion still failing. External PDF availability and browsers outside the Codex browser were not revalidated.


## Workflow finalization pass

- Fixed intrinsic grid sizing and reserved the scrollbar gutter. Browser measurements at 1280 × 800 were 1,165 px for every tab, in both assessment years. All seven mobile tabs measured 355 px at a 390 px viewport, with no page-level horizontal overflow.
- The header distinguishes **Viewing … Published · Read only / Editable draft** from **Active for visitors**. New-draft and copy previews identify their actual starting revision (or verified baseline) before creation. Selection is locked while that preview is open.
- Contextual evidence uses a desktop side panel below the revision controls and tabs, with room reserved beside the rule values. Narrow screens use a full-width modal. Escape and close restore focus; failed recipient edits reopen the drawer and focus the invalid field.
- Source documents use a compact master/detail list. Evidence keeps supplied PDF pages, printed citations, linked PDF mappings, editions and fingerprints distinct. Internal rule keys are secondary details, and counts distinguish rules from citations.
- Added tax-section shortcuts, cumulative ranges derived from stored widths, exact rebate-base/formula guidance, shared-cap scope and employment/turnover explanations traced to `engine.py`, `normalization.py` and `rules.py`. No calculation or eligibility code was changed.
- Added searchable approved-recipient tables and detail drawers, category result counts/reset, explicit filing-limit meanings, a single unsupported-year availability state, and a published review summary. Section navigation positions new content below the sticky controls.
- Browser checks included all tabs and both years, desktop light/dark, mobile light/dark, Bangla search, filter/reset, source selection, evidence and recipient panels, popovers, shortcuts, keyboard tab navigation, Escape/focus return and scrolling.
- An isolated draft in `smart_stock_dashboard_qa` retained a category-label edit across tabs, saved via the existing full-pack write, validated successfully and rejected an empty recipient label without reporting success. The invalid field received focus when its drawer reopened. The draft was discarded into immutable history after testing. Active visitors remained on AY 2027–28 revision 1 throughout; no Publish action was used in that database.
- The separate disposable API acceptance service passed 14/14 journeys and was stopped with only its uniquely identified schema removed. The tax frontend tests passed 75/75, including new evidence, range, filter and availability checks. TypeScript and the production build passed.

Final observed scores: clarity **8.5**, navigation **9**, editing efficiency **8.5**, evidence access **9**, visual consistency **8.5** out of 10. The narrowest layouts intentionally scroll comparison tables horizontally. Physical touch devices, other browser engines and external PDF availability were not revalidated. The unrelated Wealth tour-copy test noted above remains outside this change. No tax-rule corrections were proposed or inferred.
