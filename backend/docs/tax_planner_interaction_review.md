# Tax Planner interaction refinement — Chrome

## Amount-only investment follow-up: 5 November 2026

This follow-up supersedes the previous default investment workflow. It preserves the original template and the one-active-rule calculator.

| Annotation | Final adjustment |
| --- | --- |
| 1. Hero tax and rebate position | Annual tax after current rebate appears on the left, potential additional annual saving on the right, separated by a thin divider. Values come from the same backend base result; the potential saving is not subtracted twice. |
| 2. Eligibility action width | The existing reading modal now has a compact, content-width launcher without its former subtitle. The modal itself retains its illustrated content and sources. |
| 3. Investment selector | The former dropdown selected between an aggregate eligible amount and individually verified contributions. It is replaced with explicit **By category** and **One eligible total** controls. Each method preserves the other's values and only the selected method is calculated. |
| 4. Complex DPS/category forms | All 14 eligible investment tiles expose annual amount fields. No plus action, date or qualification form is required for normal annual planning. The backend's distinct `planning_category_totals` input applies shared caps and records eligibility assumptions. Insurance/PF/donation amounts represent already-eligible portions. Optional individual verification remains available for filing claims. |
| 5. Review panel | Summary cards are denser, explanations sit beside the heading, and credit status/add-payment controls align on one row. Adding a payment after “confirmed no credits” changes that answer to unknown, avoiding contradictory zero-credit claims. |
| 6. DPS blocks slider and rebate | Reproduced the old requirement for a contribution date and qualification. Direct annual DPS amount entry now calculates a complete conditional annual estimate and keeps the simulator usable. |

Additional checks cover direct entry/removal, shared caps, all 14 amount fields, retained values when changing methods, Quick's summary/edit link back to category amounts, strict filing verification, stale-result handling and clearing an incompatible hypothetical category scenario. The admin's existing active rates, category policies, visibility and shared limits continue to supply the calculation and labels. No rule values or publications were changed and no database migration is needed.

Validation: **681 backend tests, 299 frontend tests, 14 real PostgreSQL/API journeys and TypeScript**. Logs are `.local/tax-simple-backend-tests.txt`, `.local/tax-simple-frontend-tests.txt` and `.local/tax-simple-api-ui-tests.txt`. Disposable test services are separate from the local QA app and production.

Final Chrome acceptance covered Bangla and English amount tiles, direct DPS 40,000 → annual tax 16,000 / potential further saving 11,000, an active slider scenario, switching to a 100,000 aggregate total → annual tax 10,000 and back without losing DPS, the compact review screen and explicit Calculate. All 14 category fields were visible and directly editable. Desktop and 390-pixel mobile layouts had no horizontal overflow; the viewport override was reset. The screenshot `tax-simple-investments-final.png` records the paired hero and inline DPS input. The isolated QA backend was restarted with the new input contract. No migration, rule publication or production deployment was performed, and disposable test services were removed.

## Annotated follow-up: 5 November 2026

This section supersedes the older mode/unknown-scope presentation below. The public calculator uses one active administrator-published pack, with no year/purpose selection or historical mode.

| Annotation | Cause and implemented refinement |
| --- | --- |
| 1. Hero eligibility chips | Replaced the static chips with a slim illustrated action opening a native modal. It lists eligible categories, shared caps, insurance/PF/approval conditions, excluded savings, rebate limits and official sources. Labels and amounts come from the active configuration and policy map. |
| 2. Profile row | All six qualification cards fit in one desktop row, reflowing to three/two columns on smaller screens. Each displays its configured threshold. Highest applicable threshold wins; categories are not added together. |
| 3. Extra age action | Removed the separate uncertain-age link. The senior card says 65+ and uses the same annual qualification field; help explains that it must apply for the income period. |
| 4. Empty income boxes | Common salary/business/bank/other cards expose fields by default. Untouched zero-value placeholders do not create income records or change the calculation. Cards align at the top instead of stretching empty bodies. Their order stays stable after typing. Expand/collapse remains available. |
| 5. Source addition | Source selector and add button align along their bottom edges, with responsive wrapping. |
| 6–7. Plain action links | The Detailed entry action and primary Calculate action use compact icon buttons in one responsive footer row, with keyboard focus, hover and disabled states. |
| 8–10. Empty Detailed results and slider | The previous implementation changed assumptions solely on mode switch. Both layouts now use the same explicitly conditional annual estimate, retaining amounts and a usable simulator. Explicit special cases and unverified itemized eligibility still trigger review. Filing balances remain strict. |

### Calculation and interaction checks

- Network calculation waits for a 500 ms pause; obsolete requests are aborted. The last result from the same revision remains visible with an updating message rather than disappearing on each keypress. Explicit Calculate submits immediately. Results from another rule revision are invalidated immediately.
- The snapshot, assumptions tooltip, reading dialog and bilingual guide identify conditional annual planning. Unknown answers stay unknown in saved browser facts. This does not manufacture verified scope or a filing balance.
- Every special taxpayer category was checked separately through the engine and actual UI/API. The verified packs use 450,000 for woman/senior, 525,000 for disability/third gender and 550,000 for the two gazetted categories. The [Finance Act, PDF pages 142–143](https://nbr.gov.bd/uploads/acts/Finance_Act_2026.pdf#page=142) is the source; admin values remain authoritative for display. Twelve engine cases cover the six categories in both packs.
- Zero-tax and minimum-tax-bound results explain that no further saving is needed. A retained/custom scenario remains represented on the range if its usable limit changes; the backend applies actual caps and tax floors.
- Added acceptance cases for mode parity and the slider, all six category toggles, Bangla numeric input, zero-tax/high-income salary and investment totals. Existing financial-expense, withholding/filing, shared-DPS/CZM, dividend/gains, revision-conflict and admin draft-recovery journeys remain covered.

Validation: 295 frontend tests, 149 engine tests, twelve real API-backed journeys and TypeScript. API acceptance uses a fresh disposable PostgreSQL schema, synthetic test authorization and a fixed clock. The local user app uses its existing isolated QA database and published rules. No production settings or tax parameters were changed.

Chrome follow-up verified English/Bangla layouts, all four Detailed steps, the eligibility modal, a selected-woman salary-plus-bank-income case (25,000 annual liability before investment, 21,000 after 40,000 eligible investment), and a Detailed slider scenario with 16,000 additional annual saving. All six category cards share one desktop row. At a 390-pixel mobile viewport the cards reflow to two columns and the page has no horizontal overflow; the viewport override was reset. The new modal was visually checked in Bangla and supports Escape dismissal. Disposable test services were removed after acceptance; the local app remains running.

## Three-step acceptance follow-up — 6 November 2026

This follow-up supersedes the earlier four-step browser matrix below. Detailed planning now has exactly three steps: Profile, Income, Investments. Calculate is available on Investments. Less common tax credits and filing facts remain available through Optional tax adjustments, with an Apply adjustments action that closes the dialog and recalculates. Edit links close that dialog before navigating to the corresponding main step.

- Simple investment tiles accept yearly eligible amounts directly. Opening the separate verified-contributions dialog does not change the active calculation representation; adding or editing a verified contribution explicitly selects that representation. Closing the dialog preserves the simple tiles and their entered values.
- CZM donation Add focuses the new amount field. Another blank donation cannot be appended until the existing amount and date are valid. Remove restores the Add action and preserves unrelated investment amounts.
- Chrome checks covered all three steps in English and Bangla, CZM add/remove, simple DPS entry, verified-dialog dismissal and the simulator. With the local published 2027–28 pack, the synthetic salary 900,000 plus eligible DPS 40,000 showed annual tax 16,000 and further usable saving 11,000. Moving the slider to an additional 140,000 produced the comparison and minimum-tax result while retaining the base amounts; returning it to zero restored the base comparison.
- Browser automation could not retain a native donation-date fill, so completed CZM deduction arithmetic is verified by the real API integration journey rather than claimed as a completed Chrome date-entry check. Chrome confirmed the actual add/remove/focus interactions.

Final checks: **301 frontend tests across 44 files passed**, **14 real PostgreSQL/API integration journeys passed**, and **TypeScript passed**. The bilingual regression asserts three main steps, direct DPS amounts, CZM add/remove/focus and blank-entry guarding, preserved investment values, and no representation change from merely opening verification details. API coverage includes shared DPS caps, qualifying CZM deductions, slider calculation, financial expenses/credits, revision refresh and admin draft lifecycle. Logs: `.local/tax-three-tests.txt` and `.local/tax-three-api-tests.txt`. These tests use disposable services separate from the user's local QA app. No production changes were made.

## QA usability repair — 6 November 2026

Addressed the three usability findings from the subsequent sampled browser QA. Incomplete CZM entries now explain beside the fields that the amount/date must be completed or the donation removed before estimates and simulator refresh. A compact bilingual tooltip explains statutory entitlement, usable tax reduction and additional scenario saving. Zero-liability simulator and insight copy now says no tax saving is needed rather than congratulating the user for completing an investment target.

Verified each change through the Codex browser in English and Bangla: CZM Add displays the guidance and focuses the amount; Remove clears it and restores Add; zero-tax salary shows the revised text; restoring salary 900,000 and investment 40,000 resumes positive-tax comparison; the slider reaches 140,000 and the bilingual explanation opens. This is verification of these scoped UX repairs, not a new exhaustive legal or field-by-field audit. Frontend suite: 301 passing tests; TypeScript checked. Screenshot: `tax-qa-fixes-bn.png` in the task artifact directory. No tax-rule parameters or backend calculation behavior changed.

## Earlier scope and behavior

Compared the live and local Chrome tabs at1280px in English and Bangla. Live is the design and interaction reference; published v2 rules remain the calculation authority. No backend code, production rule pack or user database was changed.

- A fresh visit now starts with the same editable900000 salary example as live, other income0 and investment0. An unobtrusive example label distinguishes sample amounts. The annual estimate runs automatically; entered facts replace the example.
- Entering an eligible investment total immediately recalculates the annual estimate and hero savings. The extra verification checkbox is removed. The tooltip explains that eligibility and applicable caps are assumed for this planning total; category-specific verification remains available in Detailed.
- The investment slider works immediately when a complete base calculation has usable savings. It creates a dated hypothetical contribution and recalculates through the backend. There is no opt-in or confirmation checkbox. Closed years retain historical wording. Dates and itemized alternatives are available in Fine-tune comparison.
- During scenario-only updates, the unchanged actual base remains visible. A different published rule identity invalidates retained amounts. An incomplete Detailed scope still withholds a definitive liability.
- New itemized contributions scroll to and focus the amount field. Removing entries, switching representations and category-specific facts retain their existing data and eligibility rules.
- Calculation details, official help, profile-rule sources and financial-expense sources now open native dialogs from slim gradient/icon buttons. The reading experience uses summary cards, illustrated introductions, expandable topics, source cards and preserved official links.
- Dialogs support Escape, close buttons, native focus containment, focus return and independent scrolling. The Help-to-tour action closes the reading dialog first; completion opens Help after the guide closes.

## Browser action matrix

| Surface | Live comparison and local checks |
| --- | --- |
| Reload and Quick | Live default900000/0/0 observed; local automatic result verified; eligible total editing updates hero without a checkbox; Bangla numerals normalize |
| Profile | Four-column card order/width retained; local category toggles exercised; residency/entity/minimum/dependent facts retained; new-rule help available |
| Income | Primary income cards expand/collapse; ordinary/business/financial source controls checked; financial expense add/remove; salary basis selection; source removal |
| Investments | All14local category add/remove actions exercised in English; DPS dated qualification fields and amount focus checked; Bangla DPS add/amount/remove; CZM add/remove; aggregate/itemized selection |
| Review | All three Edit links exercised in both languages; credit add/remove and filing checkbox/date/exception controls checked; original review layout retained |
| Simulator/results | Direct keyboard slider, positive contribution, completed target and historical floor checkpoints checked; actual and scenario totals distinguishable; source and calculation dialogs open/expand/close |
| Guide/help | English and Bangla dialogs read; official source topic opened; Bangla five-step tour completed; reading modal appears after completion |
| Responsive | Existing compact desktop grids retained. Modal uses bounded viewport width and height, own scroll and single-column reading/source cards on small screens |

## Validation

The frontend suite has44files/291tests. Added explicit regression coverage for automatic sample calculation, entered eligible totals without confirmation, direct slider submission and modal dismissal. Existing tests retain Detailed unknown-scope withholding, revision-safe retained simulator output, restored-draft review, focus navigation and account/year separation.

The real PostgreSQL/API journey suite exercises9flows, including actual minimum-tax calculations, financial expenses/credits, shared DPS caps, CZM deduction, dividends/gains, revision refresh and admin draft lifecycle. Its fixtures clear the new example when a test needs an empty income baseline. Admin queries are scoped to the corresponding workflow/confirmation sections, without increasing timeouts or removing assertions.

Final command results are recorded in `.local/tax-interactions-frontend-final.txt` and `.local/tax-interactions-api-ui-acceptance.txt`; TypeScript is checked with `tsc --noEmit --incremental false`. Test services use a disposable PostgreSQL container and loopback-only API, independent of the user app.

Final acceptance:44frontendfiles/291tests passed;9/9realAPIjourneys passed on a fresh disposable schema; TypeScript and git diff whitespace checks passed. Chrome confirmed native dialog focus/dismissal and a390px reading dialog with no horizontal overflow. User frontend3100andbackend8100 remain running after test-service cleanup.

Browser previews: `tax-local-interactions-final.png`, `tax-live-interactions-reference.png` and `tax-reading-dialog-final.png` in the task artifact directory. The final comparison uses synthetic salary900000, investment10000 and slider0. Live retains older arithmetic; local uses published current-year rules.
