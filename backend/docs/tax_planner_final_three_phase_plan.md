# StockWealth BD tax planner: final three-phase implementation plan

> **Product update, 5 November 2026:** Public year/purpose selection and historical comparisons below are superseded by [one active calculator](tax_planner_active_calculator.md). Visitors use the latest admin-published rules; yearly drafts and publication history remain in admin.

**Prepared:** 5 November 2026  
**Repository baseline:** `0b990c0`  
**Deliverable:** One coordinated update to the calculation engine, rule administration, public planner and bilingual guide.  
**Execution structure:** Phase 1 backend calculation; Phase 2 backend configuration, APIs and migration; Phase 3 frontend, guide, integration and release.  
**Document status:** Implementation proposal. Preparing this document does not change application code, publish rules, migrate data or deploy services.

This is the authoritative implementation plan for this work. It incorporates and supersedes the implementation proposals in [the earlier combined audit][audit] and the subsequent chat plan. The earlier audit remains supporting evidence; the scope, architecture and sequencing below control implementation. There are exactly three delivery phases, each with a verifiable completion gate.

## 1. Outcome and agreed scope

The user should be able to select the correct assessment year, enter supported income and investment facts, understand how the estimate was calculated, and see which further facts are needed. Administrators should be able to update supported legal parameters for a year, preview the effect, and publish one complete consistent revision.

Two product decisions have already been confirmed:

1. Include routine filing estimates: annual liability, verified withholding/advance credits, and supported filing-date adjustments.
2. Support both current filing and forward investment planning in the initial release.

| User task | Assessment year | Ordinary income period | Release behavior |
|---|---|---|---|
| Estimate the current filing position | 2026-27 | 1 July 2025-30 June 2026 | Default selection; annual liability plus supported settlement estimate. Investment comparisons are historical. |
| Plan contributions during the open income period | 2027-28 | 1 July 2026-30 June 2027 | Separate verified ruleset and projected annual income/investments. Show annual projection and investment scenarios. Future filing adjustments are not enabled by copying the previous year's calendar. |

Dates and open/closed period states must be calculated using `Asia/Dhaka`, not hardcoded to the audit date. A new calendar year must not automatically select an unverified assessment year. Only published, engine-compatible years appear in the public selector.

### 1.1 Initial support boundaries

The product remains a guided individual planner. Complete the following scope across the three phases; do not describe the release as a complete return-preparation engine.

| Situation | Initial release decision | Required facts / response |
|---|---|---|
| Resident natural person with supported Bangladesh income | Supported | Profile qualifications, selected year and scope-screen answers. No company or HUF computation. |
| Ordinary private employment | Supported | Tax-relevant annual employment receipts, separately identified verified exclusions, and whether amounts are gross or already taxable. |
| Government pay-order employment | Supported through an explicitly precomputed taxable-income route | Amount from a verified salary/tax statement; do not apply the general one-third exemption again. Full allowance-by-allowance payroll calculation is outside this release. |
| Bank/FDR/DPS interest and savings-certificate profit | Supported where the ordinary treatment applies | Gross income before withholding, instrument/source type, and actual withholding separately. Special exempt instruments require their own verified policy or a review result. |
| Domestic dividends | Supported for the verified Schedule 7 natural-person cases | Gross dividend and actual withholding; separate-rate tax and exclusion from the rebate-income base. |
| Eligible listed share/fund capital gains | Supported for the ordinary individual case documented in the guide | Realized gains, qualifying listed instruments, and confirmation that the taxpayer is not a sponsor/director/placement holder for those disposals. No portfolio-value import or unrealized-gain taxation. |
| Rental income | Supported only as precomputed ordinary taxable rent | User confirms deductions/deposits/salami and any special rental component have already been dealt with. Unknown or special treatment prevents a complete estimate. |
| Business/professional income | Supported only as precomputed non-negative ordinary taxable profit in a verified non-turnover-tax case | Gross receipts and business type must establish that no positive turnover floor or special regime applies. Net profit alone is insufficient. |
| Freelancing/content creation/SME exemptions | Detect and explain; do not infer eligibility from the occupation or gender label | Claimed or uncertain conditional exemptions require review unless the exact policy and facts are supported. Do not automatically tax an exempt source or exempt all freelance receipts. |
| Common qualifying investments and deductions | Supported as specified in section 5 | Itemized eligibility or an explicitly confirmed, already eligible aggregate; no unrestricted catch-all. |
| Wealth surcharge, environmental surcharge, personal vehicle advance tax, commercial vehicle/vessel final-tax sources | Screen for applicability; calculation is outside this release | Return incomplete annual/settlement status when a trigger is present or unknown. Show valid component breakdowns without a complete payable total. |
| Foreign-source/treaty/non-resident cases, complex losses, special sectors, property/precious-metal gains, partnerships/AOP shares and prior rebate clawback | Outside automatic calculation | Keep classified inputs and give a specific reason and source-linked next step. Never move these into ordinary income to get a number. |
| Routine AY 2026-27 filing | Supported as specified in section 5.7 | Credits completeness, qualifying source/payment dates, return history and filing date. |
| First-return timing exception, return from abroad, post-AY late returns or unresolved filing adjustment interactions | Annual estimate where supported; settlement requires review | Keep first-return status separate from new-taxpayer floor eligibility. No guessed late fee or refund entitlement. |

An unsupported scenario is a defined product outcome, not a silent omission. The backend returns the affected scope and reasons. The UI may show independently valid components, but a partial figure must not be labelled annual liability or amount payable.

## 2. Source basis and verified current state

### 2.1 Sources and precedence

| ID | Source | Page convention / use |
|---|---|---|
| F | [Finance Act 2026, Bangla][source-f], 151 pages, Gazette 30 June 2026 | One-based PDF positions. Relevant amendments and enacted rates; PDF 76, 89 onward, 93-94, 123-124 and 142-144 were among the pages visually checked. |
| P | [Paripatra 2026-27, Bangla][source-p], 277 pages | Printed page 1 = PDF 14. Explains amendments and includes subsequent SROs. |
| N | [Nirdeshika 2026-27, supplied Bangla copy][source-n], 159 pages | Printed page 1 = PDF 9. Supplies individual calculation examples. |
| A | [Income Tax Act 2023, English Gazette copy][source-a], 287 pages | Supplementary base-law source found in the same resource folder; use with the later amendments. PDF 272-275 clarifies eligible instruments, life insurance and Schedule 6 deductions. |

Resolve conflicts using the enacted Act and applicable later SROs, then the Paripatra and guide explanations. Use articles for orientation only. A document's publication date does not determine every provision's effective date. Store applicability by assessment year, income period, investment/receipt date or filing date as appropriate.

The official [NBR publications listing](https://nbr.gov.bd/publications/income-tax/40/40/contents/ban) links a [177-page press-modified Nirdeshika](https://nbr.gov.bd/uploads/news-scroller/Aykor_Nirdashikha_2026-2027_BG_Press_Modify_Copy.pdf), whereas N is the supplied 159-page copy. Core rates/rebate/floor pages were previously compared visually. Preserve source edition/checksum and page references when building fixtures; do not assume page positions match between editions. The [Finance Act](https://nbr.gov.bd/uploads/acts/Finance_Act_2026.pdf), [Paripatra](https://nbr.gov.bd/uploads/news-scroller/Aykor_Poripothro_2026-2027_BG_Press_Modify_Copy.pdf), and [latest notices](https://nbr.gov.bd/information-library/latest_updates/eng) are the publication-check entry points.

Useful background links remain [RRH's enacted-Act changes](https://rrh.com.bd/insights/finance-act-2026-key-changes), [BSS's account of changes at passage](https://www.bssnews.net/js-session/400981), and [PwC's individual deductions summary](https://taxsummaries.pwc.com/bangladesh/individual/deductions). The final Act differs from proposal-era reporting. Exact statutory wording also matters: A PDF 273 excludes bonuses/other benefits from the life-insurance sum-assured base, despite the conflicting wording in the secondary summary inspected. Implement the primary-source condition.

### 2.2 Evidence boundary

- The backend, schemas, formulas, seeds, migrations, admin routes and relevant frontend/tour/draft code were reviewed.
- The live public Quick/Detailed flows, all four Detailed steps, five-step tour and both admin tabs were inspected read-only during this review sequence.
- The existing two tax test files passed: **42 tests, 3 warnings**. Several assertions preserve obsolete behavior, so this is a baseline, not legal acceptance.
- Controlled in-memory calculations reproduced the rebate-base, floor, investment-cap and malformed-slab problems.
- Actual production rows, deployment hashes and worker caches were not queried directly. The live values below are those displayed in the admin UI. Export the rows before migration.
- No production save/publish or application-code change was performed. The only existing workspace addition from the prior work is the audit Markdown document.

### 2.3 Current values and behavior to replace

| Area | Repository / live observation | Required result |
|---|---|---|
| Year | Live label `FY 2025-2026`; no real year selector or rules revision | Assessment year and income dates are explicit and drive calculation, guide and drafts. |
| General threshold | Repository fallback 375,000; live admin 400,000; live editable zero-rate slab still 375,000 | One profile-derived allowance; no duplicate editable amount. |
| Special thresholds | Live woman/senior 425,000, disability 500,000, freedom fighter 525,000 | Verified current values and precise legal qualifications. |
| Rebate | Live 3% / 15% / 1,000,000; engine applies 3% after subtracting allowance | Correct A/B calculation with 3% / 10% / 750,000. |
| Minimum | Location values 5,000 / 4,000 / 3,000; zero post-rebate tax bypasses the floor | National/eligible-new-taxpayer floor triggered by income, including zero after rebate. |
| Categories | Visible checkbox also changes legal inclusion; uncapped DPS / Savings and generic Other investment | Separate presentation from eligibility; accepted/excluded amounts and cap groups. |
| Result / tips | With salary 900,000, result advertises 6,000 saving from 40,000 investment, while Detailed tips show a 27,000 limit and 180,000 target | All guidance derives from the same returned calculation/revision. |
| Confidence | Switching to Detailed changes the badge from Good to Strong without additional facts | Scope/assumption status based on facts, not mode. |
| Drafts | One global browser key; old rent/dividends can be merged into Other Taxable Income | Versioned, owner-scoped opt-in drafts; ambiguous classification requires review. |
| Admin saving | Scalars, slabs and categories use separate saves/commits; cache invalidation is process-local | Whole-snapshot preview and atomic publication, with consistent reads across workers. |

## 3. Legal baseline to encode

These values are the initial rule-pack specification. They do not replace eligibility conditions or allow a generic admin number change to introduce new legal semantics.

### 3.1 AY 2026-27 and AY 2027-28 ordinary rules

| Rule | Initial value / behavior | Primary reference |
|---|---|---|
| General allowance | 400,000 | P PDF 14-16; F PDF 142-143 |
| Woman or age 65+ | 450,000 | Same |
| Disability or third gender | 525,000 | Same |
| Gazetted war-wounded freedom fighter or gazetted injured July 2024 warrior | 550,000 | Same |
| Eligible disabled child/ward addition | 50,000 for each qualifying child/ward; one parent claim where both are taxpayers | P PDF 15 |
| Overlapping base qualifications | Highest applicable base, plus the permitted dependent addition; no stacking of base thresholds | P profile schedule, resolved consistently |
| Taxable widths after allowance | 300,000 at 10%; 400,000 at 15%; 500,000 at 20%; 2,000,000 at 25%; remainder at 30% | P PDF 15; F PDF 142 |
| General employment exemption | Lower of one-third of qualifying employment income and 500,000 | N PDF 28 and 68-69 |
| Rebate | Lowest of 3% of A, 10% of B, 750,000 | P PDF 74-76; N PDF 60-61; F PDF 76 |
| A | Qualifying total income after relevant exemptions/deductions and statutory source exclusions, before subtracting the personal threshold | Same |
| B | Eligible investments/expenditure after instrument conditions and aggregate cap rules | N PDF 61-66; P PDF 148-149 |
| Individual floor | 5,000; 1,000 for an eligible new taxpayer; only when relevant total income exceeds the applicable threshold | P PDF 15-16; N PDF 60, 67-68 |
| DPS | Qualifying annual contributions capped at 120,000 across accounts | N PDF 61, 65-66, 69 |
| Government securities | Eligible group capped at 500,000 | N PDF 61; A PDF 274 |
| Qualifying funds / unit certificates / ETFs | New investment; the former 500,000 group limit was replaced | P PDF 148-149; N PDF 61 |
| Life insurance | Qualifying premium up to 10% of actual sum assured excluding bonus/other benefits, for the permitted insured relationships; relevant payments/proceeds payable in Bangladesh | A PDF 273-274, read with F/P amendments |
| Individual domestic dividends | Applicable Schedule 7 rate 15%; actual withholding separately credited; exclude the special-rate source from A | P PDF 149-150; F PDF 123-124; N PDF 88-90 |
| Eligible ordinary listed capital gains | Eligible realized gain exemption up to 5,000,000 and 15% on excess in the documented case; no unrealized appreciation | N PDF 51-52; A PDF 272; verify current instrument/holder qualification |
| CZM bank-transfer donation | Eligible income deduction, not an additional rebate investment | P PDF 148; N PDF 65-66 |

The current taxable widths and employment cap can be retained. Do not reintroduce the old 5% band or the removed general investment-percentage allowance model. Do not apply a 35% rate to these two years. Future scheduled thresholds/rates for AY 2028-29 onward should be documented in the source inventory, but they are not active public years in this release. [P PDF 16-18; F PDF 143-144.]

The full supported AY 2027-28 pack must be verified independently, including time-limited exemptions, instrument conditions and continuing amendments. Equal slab rates do not prove that all other rules are identical.

### 3.2 Settlement and excluded-regime rules

The revised section 163 generally treats Part 7 withholding as advance credit, while retaining final/restricted-source exceptions. Use actual eligible credits rather than multiplying income by an assumed withholding rate. Keep liability, credit and excess separate. [P PDF 95-102; N PDF 81-82.]

For an ordinary supported AY 2026-27 filing:

| Filing period | Rule applied to the applicable section 173 balance |
|---|---|
| 1 July-30 September 2026 | Incentive = lower of 5% and 25,000 |
| 1 October-31 December 2026 | No window adjustment |
| 1 January-31 March 2027 | Additional tax = higher of 2% and 3,000 |
| 1 April-30 June 2027 | Additional tax = higher of 5% and 5,000 |

[P PDF 105-108; F PDF 93-94; N PDF 68-70.] First-return and return-from-abroad provisions, official extensions/holidays, and post-assessment-year section 174 computation are separate policies. The initial automatic settlement route is limited as specified in section 5.7.

For scope screening, retain these verified facts without silently claiming to calculate the regime:

- Ordinary section 163(6) turnover category: 0% up to 20,000,000 gross receipts; 0.5% on gross receipts above 20,000,000 through 40,000,000; 1% above 40,000,000, subject to sector/exemption rules. This is not marginal slab taxation. [P PDF 235, SRO 324 of 31 August 2026.]
- Wealth surcharge can be triggered by reportable net assets above 40,000,000, more than one qualifying car, or house property above 8,000 sq ft. Use statutory definitions rather than the app's market-value portfolio. [P PDF 21-24; N PDF 70-72.]
- Environmental surcharge, personal-vehicle advance tax and commercial vehicle/vessel final taxes are separate from the individual floor and ordinary refundable credits.
- Premature encashment may recover earlier investment rebate; the new maturity rule requires effective-date and prior-claim information. [P PDF 149; N PDF 60 and 67.]

## 4. Three-phase delivery map

| Phase | Scope | Concrete output | Completion gate |
|---|---|---|---|
| **1. Backend: verified calculation engine** | Typed facts, two year packs, eligibility, income/rebate/floor/special-source arithmetic, routine settlement, scenarios and explanations | Pure deterministic engine and source-derived fixtures, usable without production DB changes | Required legal fixtures and boundary tests pass; unsupported cases return defined statuses |
| **2. Backend: rules administration, APIs and migration** | Versioned snapshot storage, publish/preview, API contracts, safe config/data conversion and consistent reads | Public v2 and admin APIs, forward migration, idempotent draft creation and staging verification | Atomic publication, concurrency, migration and API integration tests pass |
| **3. Frontend: public planner, admin, guide and release** | Unified forms/results, year-aware scenarios, admin workflow, draft/privacy changes, English/Bangla guide and end-to-end release | Fully integrated public/admin experience and coordinated production cutover | Desktop/mobile, language, migration and cross-worker release checks pass |

Develop and verify in this order. Phases 1 and 2 may be deployed dormant for compatibility testing, but do not switch public traffic or publish a misleading current-year label before Phase 3 is ready. Release work is part of Phase 3; there is no separate fourth phase.

## 5. Phase 1 - Backend: verified calculation engine

### 5.1 Source pack and executable policy inventory

Create two explicit supported rule packs, one per assessment year. For every rule record a stable ID, source/edition/page, legal provision, effective basis, supported facts, expected examples and engine policy identifier. Use primary sources to resolve secondary-summary conflicts. Include an as-of review date and source checksums in the pack metadata.

Before enabling a rule, reconcile the later official guide edition and any applicable later SRO. Do this only for supported policies, not every VAT/corporate provision in the Act. Source references and legal parameters must be reviewable in the repository. Do not place uploaded PDF binaries in Git unless the repository already has an appropriate document policy.

For any rule interpretation that cannot be confirmed from the owning provision, make a specific `needs_review` result the initial behavior. The implementer must not substitute a guessed rule to complete a number. The eligibility and non-support decisions in section 1.1 remain fixed; adding new tax regimes requires a separate scope change.

### 5.2 Typed calculation input

Replace the ambiguous flat request with explicit sections. Keep this as a service DTO in Phase 1; Phase 2 exposes the same contract through HTTP.

| Section | Fields / behavior |
|---|---|
| Identity | `schema_version`, `assessment_year`, `expected_ruleset_revision`, `purpose` (`filing`, `forward_planning`, `historical_comparison`) |
| Profile | Residence/entity type; explicit threshold qualifications; eligible dependent count and no-duplicate-claim confirmation; new-taxpayer-floor status (`yes`, `no`, `unknown`); first-return status independently |
| Income | Typed entries with stable local IDs, source kind, amount basis (`gross`, `precomputed_taxable`), amount, period, and supported qualification facts |
| Investments | Discriminated union: `confirmed_eligible_total` or `itemized`; never both. Itemized entries have category, amount, applicable period/date, cap group facts and eligibility answers. |
| Income deductions | Separate typed deduction entries, including qualified CZM donation; cannot also enter the same payment as an investment. |
| Credits | Separate entries linked to source/type, amount and relevant year/date; `credits_completeness` is `unknown`, `confirmed_none` or `complete`. |
| Filing | Optional filing date and exception flags; no date means annual-only output. |
| Coverage | Explicit answers to surcharge/vehicle, foreign/special income, loss/set-off, turnover and prior-rebate recovery checks. Unknown is not equivalent to no. |
| Scenario | Optional proposed category and amount, or explicitly confirmed eligible aggregate scenario; use the same year and revision as the base calculation. |

Use bounded, finite decimal inputs; reject negative receipts/contributions and unsupported precision rather than clamping them. Permit negative values only in a future explicit loss model, not in ordinary receipt fields. Reject unknown v2 fields so legacy payload errors cannot be silently ignored. Accept monetary values as decimal strings in the public contract and keep values as `Decimal` internally; the UI is responsible for entry/locale formatting only.

Use `Decimal` with `ROUND_HALF_UP` for the default two-decimal planning representation, never implicit Python/JavaScript defaults. Preserve precision through percentage calculations and reconcile displayed component totals. This is a planning representation, not an assertion about statutory return rounding. Where the governing provision/form requires a different rounding stage or whole-taka treatment, encode it in the policy and add a fixture before claiming that settlement format. Currency display must not hide a reconciliation difference.

Senior qualification must use the rule's documented age reference rather than contradictory `age` and `senior_citizen` fields. If the exact qualifying date is not source-confirmed, collect explicit eligibility under that year's rule rather than deriving eligibility from today's age. No NID/TIN upload is required for a planning estimate.

### 5.3 Income normalization and special tax components

1. Normalize each source once and retain entered amount, excluded amount, deductible amount and resulting taxable component.
2. For general employment, remove verified exclusions from their proper base and apply the lower-of-one-third/500,000 rule once. Identify already taxable inputs; reject requests that would apply the exemption twice.
3. Keep government-pay and other precomputed employment amounts separate from gross private salary. For non-cash benefits that the engine cannot value, request an already computed taxable amount or report the missing valuation.
4. Keep gross interest/profit and withholding separate. Entering net bank receipts as gross income must be corrected through the form's explanation/confirmation, not silently grossed up with an assumed tax rate.
5. Calculate qualified domestic dividend tax as its own Schedule 7 component. The N example demonstrates that 10% actually withheld is a credit even though dividend liability is 15%.
6. For qualified listed disposals, use realized taxable gain, the statutory exemption, and applicable special rate. Disallow unqualified sponsor/director/placement-holder cases and unrealized portfolio gains. Aggregate the annual exemption across qualifying accounts; do not apply it anew per entry.
7. Accept precomputed ordinary rent/profit only through the explicit supported routes. If rent includes an unresolved special component, or business gross receipts/type do not establish the absence of a positive turnover obligation, the annual total is incomplete.

The engine must keep ordinary, reduced/special-rate, exempt and final/restricted-source classifications distinct. A source not supported by the engine remains classified and flagged; it must not become `other_income`.

### 5.4 Thresholds, slabs and minimum tax

Derive the applicable personal allowance from the highest qualified base plus permitted dependent additions. Use only the taxable widths from the rule pack; create the zero-rate breakdown row at calculation time.

Validate the schedule before calculation: positive finite widths, bounded rates, ordered bands, exactly one unbounded final band, and complete income coverage. An allowance-only schedule, an early unbounded band or an uncovered tail must be invalid. Store no editable duplicate allowance amount in the new snapshot.

Calculate the individual's minimum-tax trigger from the relevant total income and allowance, independently of the sign of post-rebate tax. Output:

- `minimum_tax_amount`;
- `minimum_tax_triggered`;
- `minimum_tax_binding`;
- `minimum_tax_top_up`;
- the applicable policy/reason.

Only call a minimum tax binding when it changes liability. A configured 5,000 amount must not produce an “applied” message on every high-income result. Unknown new-taxpayer eligibility must produce conditional floor information or a missing-fact reason when it can affect the result; it must not be inferred from account/TIN creation in this app.

### 5.5 Investment and deduction normalization

| Item | Implementation |
|---|---|
| DPS | Rename legal category to eligible DPS contributions; aggregate annual qualifying deposits across accounts and cap at 120,000. Ordinary savings/FDR principal is excluded. |
| Government securities / savings certificates | Use one aggregate 500,000 cap group; validate year and relevant holding conditions. |
| Funds, unit certificates and ETFs | Require new qualifying investment; do not retain the removed 500,000 group cap. Flag uncertain maturity/early-disposal cases instead of applying a guessed clawback. |
| Listed securities | Accept qualifying new investment amount, not held market value, sale proceeds or unrealized profit. Deduplicate items that also fall under a fund category. |
| Life insurance | Collect eligible relationship, premium, actual sum assured excluding bonus/other benefits, and Bangladesh payment/proceeds qualification. Apply the statutory cap. Distinguish deferred annuity from a life-policy premium. |
| PF | Distinguish government PF from recognized PF. Use eligible employee/employer contributions and applicable fund limits; allow an explicitly certified eligible figure when full fund-limit inputs are unavailable. Do not automatically treat all payroll deductions as eligible. |
| Universal pension / approved superannuation / welfare or group insurance | Use separate supported statutory categories and qualification checks. Do not place these in an unrestricted Other bucket. |
| Donations / zakat | Require a supported recipient or statutory approval category, payment qualification and date. Preserve approval source/expiry in config. Unsupported recipient classification requires review. |
| CZM | Separate bank-transfer income deduction. The same payment cannot contribute to B. |
| Early encashment / prior rebate | Detect and return a review reason; automatic recovery of earlier rebates is outside this release. |

Each normalized investment returns `entered_amount`, `eligible_amount`, `excluded_amount`, `cap_group`, and reason codes. The aggregate mode accepts a user-confirmed already eligible total; its result states that individual instrument eligibility was supplied by the user rather than checked by the app. Hiding a category from the entry UI does not invalidate a legitimate API amount or an existing draft entry.

Compute A and B independently. A excludes exempt, reduced-rate, final-tax and partnership/AOP-share income as prescribed; it does not subtract the personal zero-rate threshold. Return all three rebate limits, statutory entitlement, effective tax reduction and unused entitlement caused by the tax floor. Do not present non-refundable unused entitlement as a cash refund.

### 5.6 Base and scenario calculation

Resolve one immutable ruleset and calculate base and scenario in the same service call. This replaces the current two independent frontend requests, which can display different revisions or different input states.

The scenario uses the same income/profile and applies the selected additional investment through the same qualification/cap rules. Return eligible added investment, annual liability difference, settlement difference when supported, and the limiting reason. Report zero savings at a binding floor or exhausted category cap.

For the open year, a recommendation is only available for a supported category with enough eligibility facts. A theoretical aggregate target may be shown as conditional on qualifying investment, not as a recommendation to purchase an unspecified product. For the closed year, scenarios describe investments hypothetically made during that income period; a current-date contribution must not be credited to that past period.

Separate “investment to reach the statutory rebate limit” from “investment sufficient to reach the lowest usable liability.” Prefer the latter in the main UI. If there is no usable saving, omit a purchase target and explain the constraint.

### 5.7 Routine settlement and scope outcomes

The engine supplies two independent statuses:

- `annual_status`: `complete`, `needs_review`, or `unsupported`;
- `settlement_status`: `complete`, `not_requested`, `needs_review`, or `not_available_for_year`.

“Complete” means complete for the entered facts within the declared supported scope. Precomputed/user-confirmed amounts remain explicit assumptions. If an excluded regime can change total liability, `annual_liability` is null; retain labelled component amounts instead. If only filing facts are missing, annual liability remains available and `estimated_payable` is null.

Automatic settlement in this release covers ordinary AY 2026-27 resident filings with complete supported credits, no special filing exception, and a supported date within the assessment year. Deduct only eligible credits once; compare credits against liability and keep any excess separately. A credit's source, year and claim context determine eligibility, not a single date filter applied to all advance payments.

Apply the section 170 windows on the legal section 173 basis. Use P examples 30/31 and N example 23 to establish ordering. Do not calculate a date adjustment before credits. Do not apply a location floor after subtracting credits.

Define the following initial exceptions explicitly:

- First-ever return or return-from-abroad exception: show sourced timing guidance and annual estimate; automatic timed settlement remains `needs_review` until its dedicated policy is verified and included. This does not prevent the independently verified 1,000 new-taxpayer floor from applying to annual liability.
- Zero/excess-credit balance during the neutral window: show zero additional payable and separately identified excess eligible credits; no guaranteed refund.
- Zero/excess-credit balance in an incentive/additional-tax window without a verified interaction fixture: `needs_review`, not an invented zero fee or negative incentive.
- Filing after the assessment year, court/individual extensions or unknown eligibility: annual estimate and source-linked guidance; no generic late-fee calculation.
- AY 2027-28: annual projection; settlement is `not_available_for_year` until that year's supported filing calendar is independently verified and published.

Wealth/vehicle/turnover/final-tax flags also prevent a complete filing total. The Mahbuba example in N PDF 88-90 proves why a pre-surcharge balance cannot be displayed as the final payable amount: its 21,900 balance becomes 49,620 after the example's 27,720 surcharge.

### 5.8 Engine result and explanations

Return structured data, not preformatted paragraphs that the UI must parse:

| Group | Required result |
|---|---|
| Identity | Year, income dates, revision ID, content hash, engine/schema versions, as-of date and purpose |
| Scope | Separate annual/settlement statuses; missing facts, exclusions and assumptions; field paths for corrections |
| Income | Entered amounts, normalization/exclusions/deductions, ordinary income, special components and A |
| Threshold/slabs | Applied profile and dependent addition, zero-rate threshold, amount above threshold, per-band tax |
| Investment/rebate | Accepted/rejected item amounts, B, three limits, entitlement and actual reduction |
| Liability | Ordinary/special tax, individual floor/top-up, complete annual liability or null |
| Credits/filing | Allowed/restricted credits, section 173 balance, adjustment amount/reason, payable or null, excess credits |
| Scenario | Same-revision base/scenario breakdown, eligible increment, usable savings and limiting reasons |
| Guidance | Stable message/source IDs and interpolation values for English/Bangla templates |

Do not return editor identities or private migration information in public metadata. Effective-rate displays must name the denominator; do not divide by taxable income after exemptions while calling it a percentage of gross salary.

### 5.9 Phase 1 tests and completion gate

- Implement the applicable golden fixtures in section 8, including intermediate values.
- Test each allowance/slab boundary; age/qualification overlap; dependent claims; first-taxpayer floor; zero-after-rebate floor; and non-binding floor messaging.
- Test aggregate/itemized exclusivity, cap aggregation across accounts, life-policy cap basis, donation route separation and supported gain qualification.
- Test dividends/special-rate income excluded from A while actual withholding remains a credit.
- Test invalid amounts, duplicate IDs/claims, uncovered slabs, unsupported source preservation and unknown facts.
- Test scenario savings against a binding floor/category cap and closed-period contribution dates.
- Test annual/settlement status independently, filing-window boundaries and all defined unsupported interactions.

**Phase 1 is complete when** the engine produces the approved results from both source packs without a database, all mandatory cases pass, and no unsupported case produces a complete total. Phase 2 must not need to reinterpret tax formulas.

## 6. Phase 2 - Backend: rules administration, APIs and migration

### 6.1 One versioned snapshot table

Introduce `tax_planner_rule_revisions` as the new owning table. Store the small coherent ruleset as validated JSONB rather than maintaining independent globally editable rows for each family. Keep rule semantics constrained by the engine's typed models.

| Field/group | Purpose |
|---|---|
| `id`, `country_code`, `assessment_year`, `revision_number` | Stable identity; country is restricted to BD in this release |
| `income_period_start`, `income_period_end` | Real dates independent of display copy |
| `status` | `draft`, `published`, `superseded`, `archived_legacy` |
| `payload_schema_version`, `engine_policy_version` | Prevent a ruleset from selecting unsupported computation |
| `payload` | Complete thresholds, taxable bands, employment policy parameters, rebate, investment categories/caps, supported source policies, filing calendar and guidance metadata |
| `content_hash`, `edit_version` | Canonical calculation/guidance snapshot fingerprint and optimistic draft concurrency |
| Sources | Document IDs, edition/hash, page/provision references, effective basis and last verification date |
| Provenance | Created/updated/published timestamps and actor IDs; change reason and copied-from revision |
| Preview metadata | Last previewed hash/edit version and engine policy, validation summary and reviewer acknowledgement where appropriate |

Use unique `(country_code, assessment_year, revision_number)` and partial uniqueness for one published revision and one draft per country/year. Require a valid assessment year and income-period dates for every draft, published or superseded revision. Permit null year/dates only for `archived_legacy`, enforced by a check constraint; preserve the legacy label/raw snapshot in its archival payload with no public eligibility. This avoids assigning unverified legacy settings a falsely certified legal year.

The hash covers the country/year, income dates, schema/policy versions, legal payload, public guidance and source metadata in one canonical representation. Exclude mutable lifecycle, actor and preview metadata. Any edit to a hash-covered field increments `edit_version` and invalidates the previous preview, even when the tax rates themselves did not change.

Published payloads are immutable. Status/publication metadata may change when a revision is superseded, but its values, source references and hash must not be rewritten. A correction or rollback creates a new revision. Retain this history; do not build a separate general event-sourcing system or multi-role approval workflow for this release.

### 6.2 Snapshot validation and safe resolution

Validate the complete snapshot on write, preview and publication, and validate compatibility on read. Required checks include:

- Finite bounded percentages, allowed monetary precision, matching string limits and sensible threshold relationships.
- Derived allowance instead of a stored zero-rate amount; positive taxable band widths and exactly one terminal unbounded band.
- Required and unique category codes, explicit cap groups, date/approval conditions and supported policy identifiers.
- Source coverage for each legal family and no future schedule accidentally enabled in a current year.
- Required English/Bangla label/message keys and public source links without local/private file paths.
- Engine/schema compatibility and supported-year scope.

Resolve one complete published row for each calculation. Initially read it from the database per request; the data volume does not justify an indefinite process cache or new Redis invalidation system. A read started before publication may legitimately use the old complete snapshot, but a later request with a stale expected revision receives a conflict. Never combine parts of different revisions.

Missing/invalid/incompatible configuration returns a typed unavailable result. No production fallback to the old Python constants or hybrid database/fallback categories. Compiled/source packs are used for tests, creation of verified drafts and controlled recovery, not silent runtime substitution.

### 6.3 Publication workflow and concurrency

1. A super-admin creates or resumes the year's single draft, optionally copied from a named compatible revision.
2. Save the entire draft payload with its expected `edit_version`; reject stale writes with `409 DRAFT_CONFLICT`.
3. Preview validates the snapshot, evaluates the case suite and shows old/new configuration and output differences. Bind the preview to the exact content hash/edit version and engine policy.
4. Publish requires that same hash/edit version, the expected current published revision and a change reason. Revalidate server-side; a UI success screen is not the validator.
5. In one database transaction, acquire a PostgreSQL transaction advisory lock for that country/year, then re-read and check the candidate version/hash, preview identity and expected current revision under the lock. Supersede the previous published row and publish the draft together. Use a stable lock key, not Python's process-dependent `hash()`. Enforce uniqueness constraints as a final guard. This also covers the first publication when there is no published row to lock; two simultaneous publications cannot both succeed.
6. Return the new revision/hash and invalidate only any local request-level caches. New requests resolve it directly from the database.

Bootstrap rule packs must pass fixed, source-derived expected values. For later legitimate law amendments, distinguish mandatory structural/invariant tests from comparison fixtures whose tax amounts may intentionally change. Publication requires explicit review of those deltas and new source references; do not silently regenerate expected results from candidate code or permanently block legal amendments because an older example differs.

### 6.4 Public API contract

Use the existing response envelope and `/api/v1` mount. Add:

| Method/path | Behavior |
|---|---|
| `GET /api/v1/wealth/tax-planner/v2/config?assessment_year=2026-27` | Supported years; selected complete public rules/guidance contract; current revision/hash and annual/settlement capabilities |
| `POST /api/v1/wealth/tax-planner/v2/calculate` | Validate the Phase 1 request, resolve one snapshot, return base plus optional scenario with structured explanation and separate completeness statuses |

The selected-year config includes the threshold/rate information needed to explain the calculation, category metadata and guidance parameters. It does not turn the client into another tax engine.

Allow the config query's `assessment_year` to be omitted for initial page load. Return the published year list and an explicit default from the supported filing/planning calendar; the client must not invent a year from today's date or embed a permanent 2026-27 constant. When no supported default exists, return the year list and require a selection, or the typed unavailable response if the list is empty.

Require `expected_ruleset_revision` on calculate. If it no longer matches the active revision, return `409 RULESET_CHANGED` with the current identity; the client refetches and recalculates using preserved inputs. Unsupported years return a specific supported-year error. No config returns `503 TAX_RULES_UNAVAILABLE`. Invalid input returns `422` with field-level errors. Well-formed but unsupported tax situations return structured scope reasons and no complete totals.

Apply `Cache-Control: no-store` to calculations and sensitive responses. Follow existing public-access/rate-limit patterns; limit payload size and item counts to the existing API standard. Do not log raw profile, income, investments or credits in error/analytics events.

### 6.5 Admin API contract

Keep existing role boundaries: admin reads; super-admin draft edits and publication. Under `/api/v1/admin/tax-planner/v2` provide:

| Method/path | Purpose |
|---|---|
| `GET /rulesets?assessment_year=...` | List current, draft and historical revisions with status and sources |
| `GET /rulesets/{id}` | Read the complete admin snapshot |
| `POST /drafts` | Create/resume a draft for a supported year; optional explicit source revision |
| `PUT /drafts/{id}` | Save the complete payload using optimistic edit version |
| `POST /drafts/{id}/preview` | Validate and calculate comparison cases; return field errors, changed outputs and the preview identity |
| `POST /drafts/{id}/publish` | Atomic publish of exactly the previewed version |

Use the revisions list/detail for history and comparison; no separate history service is required. Rollback is the same create-draft/preview/publish workflow using a previously verified compatible snapshot. Administrators cannot activate an unsupported engine policy or a generic arbitrary formula.

### 6.6 Legal parameters versus presentation

| Admin may manage within supported policies | Engine-owned behavior |
|---|---|
| Thresholds, taxable widths/rates and configured cutoffs | Qualification, overlap resolution and band traversal |
| Rebate percentages/cap and instrument cap values | A/B construction, exclusions, usable rebate and floor effects |
| National/new-taxpayer floor amounts | Legal trigger and eligibility distinctions |
| Supported special rates, dates and approval lists | Source classification, realization and credit treatment |
| Verified filing windows and parameters | Legal balance and exception handling |
| English/Bangla labels, order, UI visibility and source links | Visibility never changes legal eligibility |

Do not permit editing fixed category IDs/request mappings or executing formulas/scripts through the admin panel. Mark unsupported advanced families as outside the current engine instead of presenting controls that do nothing.

### 6.7 Legacy data migration

Implement forward-only Alembic changes. Do not rewrite earlier migrations. In particular, the earlier simplification migration deleted other tax-year data; new versioning cannot reconstruct that history.

Migration procedure:

1. Export the three legacy tables, identifiers, counts, timestamps, user customizations, Alembic revision and canonical hashes. Record displayed/resolved live values separately.
2. Create the new revision table and constraints additively. Preserve the legacy tables during this release for rollback evidence; do not continue treating them as a v2 source.
3. Store an archived legacy snapshot without certifying its free-text year or parameters as legally correct. Preserve disabled-category choices and labels as provenance, not automatic eligibility rules for the new packs.
4. Create the verified AY 2026-27 and AY 2027-28 drafts through an idempotent operation keyed by year and pack identity/hash. If a draft already differs, report the conflict rather than overwriting custom work.
5. Validate/preview both drafts against Phase 1 fixtures. Compare the actual live values with the new legal pack; do not assume the database matches seed defaults.
6. Publish the verified revisions for v2 through the new publication path while v2 remains unavailable to ordinary public traffic until integration is ready.
7. At Phase 3 cutover, disable legacy admin writes and route the public UI to v2. Legacy calculate clients receive `410 TAX_PLANNER_UPGRADE_REQUIRED` with refresh guidance instead of an old estimate under a new label.

Rerunning the current seed or changing fallback constants is not an upgrade operation. The existing seed inserts missing data and does not safely replace an installation's current values.

Do not introduce server-side storage for users' tax returns/results in this release. The reviewed path has none, and users' browser-draft migration is a Phase 3 responsibility. If actual deployment inventory reveals separately persisted results, retain their original metadata and mark them historical; do not mass-rewrite them to new amounts.

### 6.8 Operational controls and rollback

Use one deployment-level release switch for the new public/admin experience and one operational suspend control for v2 calculations. These are rollout controls, not legal parameters in the admin rule editor.

Record request-level revision/engine identity, latency, validation failures, scope reason counts and publication conflicts. Avoid financial payloads and identifiers in general logs. No new analytics service is required.

On a bad rule publication, publish a new revision copied from the last verified compatible revision. On an engine bug, deploy the compatible fixed/previous engine only if the source packs and contract remain valid. If no correct combination is available, suspend complete estimates with an availability message. Do not silently restore the known inaccurate legacy calculator as the fallback.

### 6.9 Phase 2 tests and completion gate

- Real PostgreSQL tests for complete snapshot persistence, unique revision/draft/publication constraints, concurrent edits and publication races.
- Forced failure between publication operations must leave the old complete revision active and no partially active candidate.
- Independent service instances/workers must resolve the same active revision on subsequent requests; stale expected revisions receive 409.
- API tests for decimal strings, field errors, unknown years, unsupported cases, missing config, privacy headers and authorization boundaries.
- Source-pack creation/migration tests: idempotency, custom-value preservation, archived legacy snapshot and count/hash reconciliation.
- Preview versus publish hash/version tests; a draft edited after preview cannot publish using the prior preview.
- Legacy route behavior and v2 feature-switch tests. Public response types/OpenAPI must be ready for Phase 3.

**Phase 2 is complete when** the full backend works through the real database and API, a staging migration and publication have been verified, and the frontend can consume a stable contract without needing to calculate tax itself.

## 7. Phase 3 - Frontend: public planner, admin, guide and integrated release

### 7.1 Year and purpose entry point

Keep the current Tax Planner route and visual language. Put the task/year selector before amount entry:

- **File for AY 2026-27** - income earned 1 July 2025-30 June 2026; closed income period.
- **Plan for AY 2027-28** - projected income for 1 July 2026-30 June 2027; open-period planning while applicable.

Render periods and source metadata from config. Preserve a separate draft per year and purpose; switching year must not silently carry previous-year actual investments into a new projected year. Offer an explicit copy of selected assumptions when useful, requiring the user to review the new dates.

Show “Rules reviewed on [date]” with source details, not an unqualified permanent “latest rules” badge. Do not call the income year “FY” in place of assessment year. Older unsupported years are not selectable.

### 7.2 Quick and Detailed share one canonical form state

Both modes edit the same typed state and call the same endpoint. Mode changes presentation depth, not a separate calculation or profile reset.

**Quick:** retain three ordinary-case amounts: gross private employment income including bonuses, other confirmed ordinary taxable income, and already verified eligible investment total. Make the default general-profile/no-special-regime assumptions visible. A Quick result is an annual estimate under those stated assumptions; it does not imply credits are zero or provide an unsupported filing balance. The first edit of a special income/profile/credit takes the user into Detailed with values preserved.

**Detailed:** retain four logical steps, with conditional groups:

1. **Profile and coverage:** precise threshold qualifications, eligible dependents, new-taxpayer-floor status, residence/entity scope and surcharge/special-regime checks. Remove Tax Area for these years. Avoid demanding full assets or personal identifiers when a yes/no/unknown trigger question is enough.
2. **Income:** separate employment route, gross interest/profit, dividends, realized listed gains and supported precomputed rent/business income. Explain gross versus already taxable amounts and show exclusions. Eliminate the hint that salary bonus belongs in the generic Other field.
3. **Investments and deductions:** choose aggregate or itemized explicitly. Show contribution dates, qualification questions, shared caps and entered/eligible/excluded amounts. Keep income deductions such as CZM separate from rebate contributions.
4. **Credits and review:** source-linked withholding/advance payments; explicit none/complete/unknown choice; applicable filing date and exception flags; review of missing facts, assumptions and accepted/excluded values with direct Edit links.

When Detailed facts cannot be represented in Quick, preserve them and explain that a simplified view cannot remove them from the calculation. Do not silently reset the profile to general, erase credits or aggregate dividend/rental classifications.

### 7.3 Results and guided scenarios

Use this result hierarchy:

1. Estimated annual liability, or an explicit incomplete-scope state.
2. Estimated balance at filing only when `settlement_status=complete`; otherwise explain the missing facts or unsupported case.
3. Expandable breakdown: normalized income, personal allowance and slabs, separate-rate taxes, eligible investment and rebate, minimum top-up, credits, filing adjustment and excess credits.
4. Base/scenario comparison with usable savings and its limiting reason.

Remove confidence stars based on mode. Replace them with factual labels such as “Uses your confirmed eligible investment total” or “Withholding credits not entered.” Do not show a full payable total when a surcharge/turnover/special-income scope flag is unresolved.

Use “Statutory rebate entitlement” and “Reduction in this estimate” where they differ. Show a minimum step only when it binds. Show excess credits separately from savings and avoid a “refund approved” implication.

For an open income period, allow an eligible category and proposed amount/date, or a clearly conditional already-eligible scenario. Show annual income as a projection, not earned-to-date income accidentally annualized without confirmation. For the closed period, label the control **Historical what-if** and state that a contribution made now does not alter that past year's investment amount.

Remove duplicated frontend formulas from tips, sliders, badges and effective-rate tooltips. The frontend formats backend values and maps reason/source IDs into translated text. Base and scenario share one response; never show a fresh scenario with an older base.

### 7.4 Request/cache/error behavior

- Include year, purpose, revision, canonical inputs and account/guest scope in query identity; do not persist full query caches containing financial inputs.
- Debounce editing and cancel or ignore obsolete requests. A late response for prior inputs must not replace the current result.
- During recalculation, clearly mark previous values as outdated or hide the headline total. Do not show `keepPreviousData` as a current answer.
- On `RULESET_CHANGED`, refetch config and recalculate once with the preserved canonical inputs; update guide/tips together. Persistent failure shows an unavailable state rather than old hardcoded constants.
- On field errors, focus the relevant input and show its message. On unsupported facts, keep entries and show the backend's scoped explanation.
- Refetch public config on year selection and normal focus/reconnect. The calculate revision check remains the authority even if a tab has stale config.
- On account changes/sign-out, clear in-memory financial form/query state before rendering another account's page.

### 7.5 Browser drafts and privacy

New drafts are session-only by default. Offer explicit **Save on this browser** for signed-in users, with an account/year/purpose/schema-version key and a **Clear saved draft** action. No new server-side financial draft store is introduced.

Legacy migration behavior:

| Existing condition | Required behavior |
|---|---|
| Account-attributable draft with compatible raw fields | Preserve inputs, attach year/schema identity after user review, and recalculate. Do not retain the old result as current. |
| Unowned `wealth.taxPlanner.v1` draft | Do not automatically load it for the current account or display its amounts. Leave it untouched during the rollout; manual re-entry is the default. |
| Old dividend/rental fields still separate | Preserve their original source types. Never run the existing merge-into-Other adapter. |
| Values already merged into Other | Require the user to classify them again; the original split cannot be reconstructed reliably. |
| Aggregate and itemized investments both present | Ask which representation is authoritative before calculating; never add them by default. |
| Old broad freedom-fighter / savings / exemption fields | Preserve raw entry for the attributable draft, but require fresh eligibility answers. |
| Scenario amounts | Store as hypothetical separately from actual investments. Never persist simulated contributions as actual paid amounts. |

Guest inputs remain in memory for the current tab/session. Browser saving must not put amounts in URLs, telemetry events or general error logs. Preserve existing guide preferences independently of financial drafts.

### 7.6 Admin editor

Keep the existing `/admin/tax-planner` entry point and super-admin permissions. Replace the independent global editors with a year-aware editor for the complete snapshot.

**Header:** assessment year, income period, Published/Draft status, revision, last reviewed date, sources and publication actor/time.

**Sections:** profiles/thresholds; ordinary taxable bands; employment and rebate; investment eligibility/caps; supported income/credit policies; minimum tax; filing calendar; bilingual labels/help/source references. Unsupported advanced regimes show a scope explanation, not editable ineffective fields.

**Presentation versus law:** label/order/visibility controls are grouped separately from eligible policy, cap and approval dates. The editor explains that hiding a card changes presentation only. Existing valid entries remain visible in review even when the card is hidden for new entries.

**Action flow:**

1. **Create/Edit draft:** copy a named compatible revision or start from the supported year pack. Published values are read-only.
2. **Save draft:** one aggregate request, with an unsaved-changes indicator and field errors. No parallel scalar/slab saves.
3. **Validate and preview:** show current/proposed values, meaningful fixture outputs, scope changes and amounts that change. Display English/Bangla text using candidate values.
4. **Publish revision:** show the exact year, draft/hash and effective scope; require a change reason and the latest preview. Display the returned published revision.
5. **History/compare:** compare retained revisions. To restore a previous valid rule, create a new draft from it and publish normally.

For a 409 conflict, preserve local edits, show the newer revision and require the administrator to reload/merge deliberately. Never silently overwrite. A publication error must leave the current published revision visibly unchanged. After publish, refetch both admin and public config and verify the active revision through the API.

### 7.7 English/Bangla guide and help

Keep the current lightweight five-step tour, updating both desktop and mobile versions together:

1. Select filing year or forward planning and understand the income dates.
2. Start a Quick annual estimate and see its assumptions.
3. Add the facts Detailed needs for income, investments and credits.
4. Read liability versus balance at filing and explore only period-appropriate scenarios.
5. Review missing items and open the permanent tax guide / official filing site.

Also provide an always-available guide panel/page within the existing planner experience, with:

- What changed for the selected year, with source links and verification date.
- Taxable income versus the personal zero-rate band versus the rebate base.
- Eligible contributions, caps and examples of items that do not qualify.
- Gross interest/dividends versus source tax; annual liability versus settlement.
- Minimum-tax and first-taxpayer distinctions.
- Closed-year versus forward-planning examples.
- Documents the user should consult: salary statement, interest/dividend certificates, investment/premium records and tax-payment records; no upload requirement.
- Specific unsupported situations and the appropriate official reference/next step.
- A link to [NBR e-Return](https://etaxnbr.gov.bd/) for actual filing; no automatic filing or payment integration.

Use code-owned bilingual templates keyed by the backend's rule/message IDs. Insert rates, dates and example values from the verified revision and engine outputs. Administrators may manage supported labels/source metadata but cannot publish arbitrary formula prose that contradicts the engine. Any substantive explanatory template change is versioned with the frontend and checked for compatibility with the rule pack.

Do not reset “don't show again” preferences merely because rates changed. Make the updated guide reachable from the persistent launcher and surface a concise rule-change notice when a saved draft's revision changes. Keep implementation IDs out of normal user copy; expose revision details in Sources/Details when needed.

### 7.8 Accessibility and responsive behavior

Use the existing component system. On mobile, place the form and result in a readable single-column flow with concise expandable breakdowns. Preserve labelled fields, keyboard access, visible focus, error-to-field association and modal focus restoration. Announce a completed estimate politely without reading every numeric update on every keystroke.

Use consistent English/Bangla terminology, locale-aware BDT formatting and parsable numeric entry. The same inputs must produce the same amounts in both languages. Avoid translating legal categories into broader eligibility claims. Validate dark/light contrast and long Bangla text without redesigning the whole wealth workspace.

### 7.9 Integrated tests and production cutover

Before release:

1. Verify the Phase 1 fixtures through the Phase 2 public API and Phase 3 UI, including field-to-result mapping rather than only rendered snapshots.
2. Test Quick/Detailed equivalence for equivalent facts, preservation of richer facts, aggregate/itemized conversion and profile/year changes.
3. Test stale responses, revision conflicts, unavailable rules, hidden-but-valid categories, zero credits versus unknown credits and complete versus partial result labels.
4. Test owner-scoped opt-in drafts, sign-out/account change, legacy ambiguity and scenarios not becoming actual contributions.
5. Test every admin state, failed/competing publication, history/restore and public revision propagation across workers.
6. Inspect English/Bangla, desktop/mobile, keyboard flow and the five-step tour against actual UI targets.

Cutover procedure within Phase 3:

1. Confirm backup/export, current DB migration and verified v2 snapshots in staging and target deployment.
2. Deploy the compatible backend and frontend assets while the new public path remains dormant.
3. Run authorized synthetic checks of config, calculation, guide values and admin preview. Do not change live financial settings merely to test saving.
4. Enable the coordinated v2 experience; disable legacy writes/calculation according to section 6.7.
5. Check the active year/revision/hash, representative ordinary and investor results, unknown-credit behavior and no stale guide values across workers.
6. Monitor errors/conflicts/unsupported counts and use the defined suspension or verified rollback procedure if needed.

**Phase 3 is complete when** both public tasks, the admin publication flow and the bilingual guide work together on the same revision; mandatory tests pass; data/rollback checks are recorded; and the live release has been verified within the authorized deployment scope.

## 8. Shared golden fixtures and acceptance criteria

These cases are the common contract between engine, APIs, admin preview, frontend and guide. Record normalized inputs and intermediate values with their source. Do not derive the expected values from the implementation under test.

| ID | Source / normalized case | Required checkpoints |
|---|---|---|
| G01 | Current UI scenario: general existing taxpayer; private salary 900,000; no investments/credits | Employment exemption 300,000; ordinary income/A 600,000; allowance 400,000; gross and annual tax 20,000; income rebate limb 18,000. |
| G02 | G01 with hypothetical eligible investment 40,000 in the applicable income period | Rebate 4,000; annual tax 16,000. Same result in Quick and Detailed. |
| G03 | G01 with sufficiently eligible investment 150,000 | Usable saving 15,000; annual tax 5,000 floor; no promised saving below the floor. Category caps must still qualify the 150,000 total. |
| G04 | Ordinary income 900,000, eligible investment 300,000 | Gross 60,000; rebate 27,000; annual tax 33,000. Detects the post-allowance rebate-base defect. |
| G05 | N example 18, PDF 62-63: female, normalized ordinary income 980,000; B 317,000 | Gross 64,500; rebate 29,400; liability 35,100; credits 6,400; neutral-window payable 28,700. Government salary is already normalized. |
| G06 | N example 20, PDF 65-66: income 2,920,000; CZM deduction 70,000 | A 2,850,000; B 1,080,000; gross 502,500; rebate 85,500; liability 417,000. Exclude FDR principal/laptop cost and no duplicate donation claim. |
| G07 | N example 22, PDF 67-68: eligible new taxpayer, income 430,000, DPS 96,000 | Gross 3,000; rebate entitlement 9,600; annual floor/liability 1,000. First-return timed settlement is a separate coverage decision. |
| G08 | N example 23, PDF 68-70: private salary 1,260,000 plus excluded group-insurance benefit 60,000 | Employment exemption 420,000; ordinary income 840,000; B 270,000 after DPS cap; gross 51,000; rebate 25,200; liability 25,800. |
| G09 | G08, ordinary verified filing facts | Early payable 24,510; neutral 25,800; January-March 28,800; April-June 30,800. |
| G10 | P example 30, PDF 107: tax 60,000; WHT 15,000; eligible early filing | Balance 45,000; incentive 2,250; payable 42,750. |
| G11 | P example 31, PDF 107-108: corresponding January-March case | Balance 45,000; additional 3,000; payable 48,000. |
| G12 | P examples 23/24, PDF 75-76 | A 50,000,000 and B 10,000,000 gives rebate 750,000; A 20,000,000 and B 4,000,000 gives 400,000. Component tests, not a claim that high-wealth scope is covered. |
| G13 | N example 12, PDF 51-52: ordinary business income 1,500,000 and eligible realized listed gain 6,000,000 | Ordinary tax 170,000; exempt gain 5,000,000; special tax 150,000; A excludes special gain; with example B, rebate 45,000; liability 275,000; allowed credit 150,000 gives 125,000. API scenario must separately establish business scope. |
| G14 | N Mahbuba example, PDF 88-90: female; normalized ordinary income 1,162,000; dividend 150,000; B 310,000 | Ordinary tax 92,400; dividend tax 22,500; rebate 31,000; pre-surcharge liability 83,900; credits 62,000; pre-surcharge balance 21,900. Source's surcharge 27,720 leads to 49,620. Initial public output with the surcharge trigger must be incomplete, never 21,900 as final payable. |
| G15 | Age/qualification and floor boundaries | At general 400,000 no individual floor; qualifying senior with 430,000 ordinary income has zero; general existing taxpayer at 405,000 pays 5,000; eligible new taxpayer 1,000, independent of location. |
| G16 | Ordinary income 2,000,000; DPS paid 240,000 | Eligible DPS 120,000; gross 290,000; rebate 12,000; liability 278,000. |
| G17 | Invalid config and revision races | Allowance-only/incomplete-tail schedule rejected; candidate partial publish rolled back; stale revision returns conflict; no hybrid config. |
| G18 | Dates, drafts and explanations | Closed-year new contribution excluded from actuals; forward scenario uses its own year; old merged dividend is flagged; language changes do not change amounts; unknown credits never become confirmed zero. |

For G06, B comprises insurance 60,000, capped DPS 120,000, savings certificates 150,000, zakat 50,000 and qualifying fund investment 700,000. The separate CZM deduction is not in B. These details must appear in the test input and admin example explanation.

The existing command, run from the `backend` directory, is a useful baseline, with new targeted files added during implementation:

```powershell
& '.venv\Scripts\python.exe' -B -m pytest `
  app/tests/test_wealth_calculations.py `
  app/tests/test_tax_planner_config.py -q -p no:cacheprovider
```

Add engine and PostgreSQL/API integration tests in the backend and Vitest/component tests in the frontend. Use the supported browser tools for staging desktop/mobile and cross-screen verification. Run the repository's existing type/lint/build checks as applicable; do not consider a screenshot test a substitute for tax arithmetic or publication tests.

## 9. Findings-to-delivery checklist

This maps every major finding from the combined audit to a concrete owner in the three phases.

| Finding / audit IDs | Backend resolution | Frontend / management resolution |
|---|---|---|
| Incorrect rebate base and obsolete parameters: C01-C02 | Phase 1 A/B engine and two source packs | Phase 3 one returned explanation for snapshot/tips/guide |
| Minimum trigger/location and misleading applied floor: C03, C12 | Phase 1 national/new-taxpayer logic and binding/top-up fields | Phase 3 remove location UI; show only actual floor impact |
| Age/category/dependent gaps: C04-C05 | Phase 1 precise profile facts and qualification | Phase 3 profile questions and ambiguous old-draft review |
| Uncapped/double-counted investments: C06-C07 | Phase 1 eligibility, cap groups and input union | Phase 3 accepted/excluded display and explicit mode conversion |
| Income aggregation and employment treatment: C08-C09 | Phase 1 typed income routes and scope checks | Phase 3 separate cards and precomputed-income explanations |
| Missing credits/filing and non-resident handling: C10-C11 | Phase 1 settlement policies and non-support statuses | Phase 3 distinguish annual estimate, payable and missing facts |
| Invalid input and missing provenance: C13-C14 | Phase 1 validation; Phase 2 revisioned response | Phase 3 field errors, source details and draft identity |
| Global singleton, partial writes and stale workers: A01-A03 | Phase 2 single snapshot, atomic publication, DB reads | Phase 3 one year-aware admin save/preview/publish flow |
| Weak legal config validation: A04-A05 | Phase 1 schedule validation; Phase 2 complete publish validation | Phase 3 field-level candidate errors and preview |
| Visibility/eligibility and category omission: A06-A07 | Phase 2 explicit typed category semantics | Phase 3 presentation controls separated from legal values |
| Old fallback/hybrid config: A08, A12 | Phase 2 fail explicitly, supported-year resolver | Phase 3 unavailable state, no hardcoded legal constants |
| Replace-row uniqueness, seed and actor/history: A09-A11 | Phase 2 new snapshot path, forward migration and publication metadata | Phase 3 compare/history/conflict handling |
| Lost classification and unowned saved values | Phase 1 rejects ambiguous sources; Phase 2 no invented return history | Phase 3 safe draft adapter/account isolation |
| Misleading confidence/tour/closed-period suggestions | Phase 1 scope and scenario reasons | Phase 3 revised result labels, date-aware guide and simulation |
| Overcomplicated proposed management architecture | Phase 2 one table and minimal endpoints; no new cache/event platform | Phase 3 one editor and preview workflow using existing UI components |

## 10. Implementation entry points and final completion definition

Use the existing module boundaries and naming conventions. [The original v2 design][original-v2] explains the current module's intent; update its current-state references during implementation so it does not contradict the delivered behavior. The owning locations are:

- Backend engine: [tax planner service][service], [formula helpers][formulas], [wealth schemas][schemas]. Extract small policy/normalization modules within the wealth area as necessary; do not build a general tax DSL.
- Backend management: [tax config module][configservice], [models][models], seed and Alembic migrations. Replace active v2 reads/writes with the revision repository while retaining legacy data for evidence.
- Public frontend: [planner workspace][workspace], hooks, types and rebate helpers. Split the large workspace into focused form/result/guide components while changing behavior; avoid an unrelated visual rewrite.
- Admin frontend: [admin tax planner view][adminview] and its form helpers.
- Guide: [tax planner guide configuration][guide] and English/Bangla dialogs/templates.

At the end of Phase 3, all of the following must be true:

1. Both approved assessment-year tasks are available with exact income dates and compatible verified snapshots.
2. Every supported estimate matches its source fixtures, and unsupported combinations cannot produce a misleading complete total.
3. Admin publication changes all legal values together and is visible consistently to subsequent requests across workers.
4. The public result, scenario, tips, tour and guide use the same revision and meaning for income, rebate, floor and payable.
5. Existing config is preserved, browser inputs are handled without guessed eligibility/classification, and user/account boundaries are respected.
6. The migration, test evidence, source references, operating procedure and rollback/suspension path are documented and verified.

The outcome is a maintainable planner for the explicitly supported individual cases, with a usable guide for the remaining cases. Adding more tax regimes later should extend the typed policies and source fixtures, not weaken the initial scope checks or reintroduce ad hoc frontend arithmetic.

### Implementation follow-up

The supported financial-income fields now separate gross income, source expenses allowed under sections 64–65, and actual withholding. Expense eligibility and potential losses remain reviewable. Detailed mode requires explicit scope answers; conditional Quick assumptions are not saved as facts. On restoring a previous browser draft, ambiguous older “No” defaults must be reconfirmed.

The admin revision workflow includes audited, version-checked discard and optional replacement of an open draft, with publication as a separate action. The editor directs cross-field errors to the relevant control or section and leaves the unverified AY 2027–28 filing calendar disabled. Evidence references separate the original PDF from the public edition; only verified public pages receive anchors. See the [rollout procedure and isolated acceptance commands](tax_planner_backend_rollout.md).

[audit]: E:/python-projects/smart-stock/backend/docs/tax_planner_2026_27_audit_and_proposal.md
[original-v2]: E:/python-projects/smart-stock/backend/docs/tax_planner_v2.md
[source-f]: <C:/Users/asus/Downloads/BD Tax Law Resources/Finance Act 2026 Bangla.pdf>
[source-p]: <C:/Users/asus/Downloads/BD Tax Law Resources/Income_Tax_Paripatra_2026_27 (bangla)_comp.pdf>
[source-n]: <C:/Users/asus/Downloads/BD Tax Law Resources/Income_Tax_Nirdeshika_2026_27 (bangla)_comp.pdf>
[source-a]: <C:/Users/asus/Downloads/BD Tax Law Resources/Income Tax Act, 2023 English.pdf>
[service]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_planner_service.py
[formulas]: E:/python-projects/smart-stock/backend/app/modules/wealth/formulas/financial_formulas.py
[schemas]: E:/python-projects/smart-stock/backend/app/modules/wealth/wealth_schemas.py
[configservice]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_config/tax_config_service.py
[models]: E:/python-projects/smart-stock/backend/app/models.py:1345
[workspace]: E:/python-projects/smart-stock/frontend/features/wealth/tax-v2/planner-workspace.tsx
[adminview]: E:/python-projects/smart-stock/frontend/features/wealth/tax-v2/admin-workspace.tsx
[guide]: E:/python-projects/smart-stock/frontend/features/guide/config/tax-planner-guide.ts
