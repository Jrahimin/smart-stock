# Tax Planner desktop parity map

This inventory compares the original desktop workspace at commit `0b990c0dcce74f5d3593eb32191ddc1fb8e22e1f` with the v2 workspace. The original source is `frontend/features/wealth/components/tax-planner-workspace.tsx`, with presentation in `frontend/app/globals.css`. The current workspace uses `frontend/features/wealth/tax-v2/`. Desktop browser comparison is performed at 1440 × 1000.

The original component, layout classes, tooltips, gradients, animations and interaction patterns are the visual reference. Assessment years, eligibility, credits and result semantics follow the current backend contract.

## Element and interaction inventory

| Original element or activity | Current owner and preserved behavior | Tax-law or data adjustment |
| --- | --- | --- |
| Wealth navigation and guide launcher | Existing WealthSubNav | Same route and account boundaries |
| Gradient hero, compact FY badge, title and subtitle | TaxHero, original hero classes | Badge adds assessment year and exact income period |
| Four benefit chips | TaxHero, original chip classes and copy | Retained |
| Floating jar, savings preview, educational category chips | TaxHero and SavingsJar | The original half-full hero jar is decorative and hidden from assistive technology. Savings preview values come from the resolved backend result; missing estimates remain unavailable |
| Savings preview before a closed period | TaxHero | Explicit historical comparison |
| Compact Quick and Detailed segments | PlannerYear, original mode classes | Canonical facts persist between modes. The tablist supports arrows, Home and End with a single active tab stop |
| Three equal desktop Quick fields | QuickForm, original form grid | Gross salary, confirmed ordinary taxable income and verified eligible investment total |
| Quick field placeholders and short helper lines | Input and QuickForm | Explain gross, taxable and eligible bases |
| Investment information popover | TaxInfoTooltip | Supported categories and eligibility confirmations replace assumed eligibility |
| Automatic calculation on input changes | PlannerYear debounce | Ordinary fact edits in either mode activate backend calculation, including a Detailed-first session. One v2 API request binds base and scenario to a revision |
| Quick-to-Detailed link | QuickForm | Values persist. Quick assumptions remain request-only |
| Four numbered Detailed steps, completed ticks, Back and Next | PlannerYear, original stepper | Profile, income, investments, review and filing facts |
| Special-category image cards and selected indicators | ProfileStep, original taxpayer classes | Current qualified categories, including third gender and July-warrior eligibility. Senior qualification uses one card plus a compact Not sure action |
| Tax area | Removed | Location no longer determines the ordinary individual minimum. Tax residence remains a separate scope question |
| Green allowance confirmation strip | ProfileStep | Uses a backend-confirmed allowance or an explicit pending state. Unrelated missing income or surcharge facts do not conceal a known profile allowance |
| Multiple selected profile categories | ProfileStep | Backend applies the highest eligible threshold and qualified dependent addition |
| Income two-column expandable icon cards | IncomeStep | Typed sources separate ordinary income, financial income, dividends and listed gains |
| Employment card and annual salary input | IncomeStep and IncomeFields | Gross versus already-taxable basis and noncash-benefit confirmation |
| Business or freelance card | IncomeStep | Verified ordinary profit, gross receipts and regime |
| Deposit and savings card | IncomeStep | Bank, FDR, DPS and savings-certificate income remain individually identifiable |
| Other income card | IncomeStep | Separate rent, dividend, listed gain and unsupported-source options |
| Card expand/collapse and plus/minus affordances | IncomeStep | Collapsing preserves entered facts |
| Direct navigation from a missing fact | PlannerYear and IncomeStep | Opens the relevant card and focuses the field |
| Eight original investment themes | InvestmentsStep and category presentation | Current category codes and visibility come from the selected rule pack |
| Investment icon tiles, add amount and remove amount | InvestmentsStep | Each contribution retains its date and qualification fields. A saved aggregate remains separate; a compact action explicitly switches to itemized entry before adding categories |
| Repeated contributions in one category | InvestmentsStep | Shared caps are applied by the backend |
| DPS, government security and insurance hints | InvestmentFields | Selected rule-pack caps and statutory qualification facts |
| Life insurance and PF detail | InvestmentFields | Sum assured, relationship, location, certification or contribution split |
| Approved donation tile | InvestmentFields | Approval recipient and effective dates |
| Other eligible investment tile | InvestmentsStep | No arbitrary automatic eligibility |
| Good to know icon tips and information popovers | InvestmentsStep | Rule-pack rates, backend income base and eligibility |
| Three review summary cards and Edit links | PlannerYear review | Selected profile categories, senior/dependent context and unresolved profile facts remain visible; income and investment cards summarize the entered representation |
| Review calculation action | PlannerYear review | Actual credits and filing exceptions are reviewed in the same step |
| Red, green and purple snapshot cards | TaxSnapshot, original story classes | Annual liability, additional usable saving and backend target |
| Snapshot confidence pill | TaxSnapshot | Truthful scope status replaces numerical confidence stars |
| Effective-rate information popover | TaxSnapshot | Backend annual liability divided by normalized income before allowance |
| Before-allowance information popover | TaxSnapshot | Ordinary and special-rate income retain their legal distinction |
| Rebate information popover and limiting-rule explanation | Rebate explanation components | Backend limit amounts, entitlement, usable reduction and minimum-tax effect |
| Lavender investment simulator panel | ScenarioForm, original play classes | Closed periods use historical titles |
| Jar progress and current/target sidebar | ScenarioForm | Backend usable target. Zero potential saving is a completed state; unknown remains unavailable |
| Target-achieved badge | ScenarioForm | Based on a complete backend result with no further usable saving |
| Recommendation or completion banner | ScenarioForm | Uses backend additional investment and potential saving |
| Current and projected rebate chips | ScenarioForm | Statutory entitlement and effective reduction are labeled separately |
| Active limiter badge and detailed rebate popover | Rebate explanation components | Identifies ties and the minimum-tax floor without running a client tax formula |
| Slider additional and total investment summary | ScenarioForm | Additional input and backend-confirmed eligible total |
| Slider fill, thumb value and markers | ScenarioForm, original slider classes | Marker geometry is presentation only |
| Slider pointer, keyboard and debounce interaction | ScenarioForm and PlannerYear | Explicit hypothetical eligibility and contribution date precede a comparison |
| Slider discovery animation and reduced-motion behavior | ScenarioForm | Reuses original discovery classes and respects reduced motion |
| Current tax, further investment and saving metrics | ScenarioForm | Actual and scenario output remain distinguishable |
| Contextual journey cards | TaxJourney | A simple gross-salary case uses the original eight-step salary sequence. Entered zero-valued other sources remain in the facts without adding irrelevant presentation steps |
| Journey descriptions, icons and visual bars | TaxJourney, original node classes | Captions explain the actual source and backend checkpoints |
| Extra mixed-income or minimum-tax journey steps | TaxJourney | Relevant steps appear when needed. Rebate, post-rebate tax and top-up reconcile. Readable auto-height cards, keyboard-focusable scrolling and directional controls expose additional steps |
| Journey four summary metrics | TaxJourney | Income before allowance, effective tax reduction, annual liability and effective rate |
| Original insight cards and savings CTA | TaxJourney | Source-derived threshold, backend remaining opportunity and completion state |
| Explore More Savings CTA | PlannerYear | Preserves the original smooth scroll and focus of the existing simulator. Review Edit links separately open the corresponding Detailed step |
| Footnote and permanent official help | PlannerYear | Compact evidence disclosures retain edition and page provenance |
| Desktop and mobile guided tour | Existing guide components | Anchors remain visible and finish reveals official help |
| Legacy automatic ownerless browser save | Explicit owner/year/purpose draft actions | Earlier default confirmations require review. Current confirmed facts retain their provenance. Restored drafts and their subsequent edits wait for explicit Calculate before automatic updates resume |
| Loading, errors, aborts and revision conflicts | PlannerYear and v2 API client | Stale responses cannot replace current facts or published revisions. A retained simulator base must match the selected year, revision/hash, schema/engine contract and income period; incomplete scenario editing may retain a same-revision base |
| Original hover, disabled, selected and animation styling | Original global classes with small scoped additions | No legal values are embedded in styling |

## Gaps identified in the first restoration

The first restoration recovered the major containers but omitted smaller premium interactions. The missing elements were desktop three-column sizing, input and snapshot popovers, investment completion and recommendation states, total-investment slider context and markers, the profile allowance strip, category-first investment selection, review Edit cards, journey descriptions and summaries, and the original insight actions. The contextual journey also needed to avoid unnecessary zero-value nodes in the common salary case.

The parity pass restores these elements through the v2 contract. The original rebate helper calculations are historical references. Current legal arithmetic stays in the backend.

## Verification and boundaries

Source implementation is complete for the inventory above. The focused component and API checks below verify the listed interactions; final visual parity and the remaining full-suite checks are parent-owned acceptance steps. On 2026-11-05 the following local checks passed:

- `npm.cmd test -- --exclude '**/.next/**' features/wealth/tax-v2/planner-template.test.tsx features/wealth/tax-v2/workspaces.test.tsx features/wealth/tax-v2/facts-api.test.ts`: 45 tests passed across 3 files after independent-review repair. These cover mode keyboard semantics, popover pinning/Escape dismissal, contribution add/remove, review Edit navigation and actual profile context, contextual eight-step salary rendering, minimum-tax reconciliation, completed and unavailable targets, compact source disclosures and missing-field focus. Lifecycle regressions additionally verify Detailed-first category/income recalculation without invented coverage confirmations, retained same-revision base versus unavailable old-revision values, fresh-revision recovery, and the restored-draft explicit calculation gate.
- `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8113/api/v1 npm.cmd run test:tax-planner-ui -- -t 'keeps the original savings slider tied to a historical backend scenario'`: 1 passed, 8 intentionally skipped. The real isolated API journey verifies the original automatic estimate, eight-step salary presentation, CTA scroll/focus, potential saving, actual scenario comparison, contribution date, minimum-floor checkpoints, completed banner, backend-confirmed total investment and slider markers/fill.
- `node_modules/.bin/tsc.cmd --noEmit --incremental false`: passed.

These are component and real-API integration checks, not a claim of pixel parity. Parent-owned browser inspection compares the actual 1440 × 1000 desktop pages in light/dark modes and English/Bangla, then performs the final combined test gates. The original guide anchors and missing-field navigation are covered in the focused tests. No full build ran against the active development `.next` directory.

This document records local source and interaction parity. Deployment, published production revisions and current authentication state require their own target-environment checks.
