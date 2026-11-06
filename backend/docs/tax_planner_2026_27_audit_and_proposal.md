# Bangladesh individual tax planner: 2026-27 audit and alignment proposal

**Audit date:** 5 November 2026  
**Repository reviewed:** `E:\python-projects\smart-stock`, commit `0b990c0`  
**Scope:** Backend calculations, rule storage and resolution, seeds and migrations, admin configuration, and the frontend contracts affected by backend changes.  
**Status:** Findings and implementation proposal only. No application code, existing configuration, database records, migrations, or deployed services were changed.

## 1. Decision summary

The current module should not be treated as an aligned AY 2026-27 calculator after only editing its admin values. It has both outdated parameters and calculation/model gaps. The most consequential defects are:

1. The investment rebate's 3% limit uses income **after subtracting the personal tax-free threshold**. The government formula uses the qualifying total-income base before that threshold subtraction. Updating 15% to 10% does not fix this.
2. The fallback/seed thresholds are 375,000 / 425,000 / 500,000 / 525,000. The enacted AY 2026-27 amounts are 400,000 / 450,000 / 525,000 / 550,000, with additional eligibility categories and a disabled-dependent allowance.
3. Minimum tax is tied to location and is skipped when post-rebate tax is zero. The current rule is a national 5,000 floor, or 1,000 for an eligible new taxpayer, when total income exceeds the applicable threshold, including when rebate consumes the calculated tax.
4. Investments are added without statutory category caps or eligibility checks. Income types with different legal treatment are added into one progressive-tax bucket. Withholding credits and filing-date adjustments are absent.
5. Admin configuration has no real assessment-year identity or immutable revision. Scalars and slabs save independently. Process-local caches can retain different rules across backend workers. Inadequate slab validation can accept a configuration that calculates no tax on high income.

**Recommended direction:** Correct the backend calculation contract, introduce a small versioned ruleset with atomic publication, and make the admin editor operate on that same contract. Keep formulas and supported legal strategies in code; put dated rates, thresholds, caps, eligibility parameters, and source references in typed configuration. Add explicit scope checks for tax situations not yet implemented.

This does not require a general-purpose tax programming language or a large approval system. It does require more than the current three global, immediately editable collections.

## 2. Evidence, source precedence, and limits

### 2.1 Primary documents

References below use these short names. **PDF page means the one-based page position in the supplied file**, not the printed page number.

| ID | Supplied source | Size / provenance | Citation convention |
|---|---|---|---|
| P | [Income Tax Paripatra 2026-27, Bangla][source-p] | 277 PDF pages; dated 2 September 2026 | Printed page 1 is PDF page 14. For example, P printed 61-63 = PDF 74-76. |
| N | [Income Tax Nirdeshika 2026-27, Bangla][source-n] | 159 PDF pages; foreword dated 1 September 2026 | Printed page 1 is PDF page 9. For example, N printed 52-54 = PDF 60-62. |
| F | [Finance Act 2026, Bangla][source-f] | 151 PDF pages; Gazette dated 30 June 2026 | References use PDF positions because Gazette page numbers are different. |

All three files were indexed. The individual-tax provisions, relevant amendments, appendices, and worked examples were examined in depth. Relevant Finance Act pages were also inspected visually because its legacy-font extraction is unreliable. Corporate income tax, VAT, customs, and unrelated procedural amendments are not treated as features of this individual planner.

The NBR site currently links a **177-page press-modified Nirdeshika**, while the supplied N file has 159 pages. The official publications listing dates its entry to 24 September 2026. I checked the later document's key threshold, minimum-tax, rebate, investment, and filing-incentive pages visually; those checks support the core rules used here. The two files are not byte-identical, and this audit does not assert that every page is identical. Pin the selected source file and checksum when preparing the implementation ruleset. [Official publications listing](https://nbr.gov.bd/publications/income-tax/40/40/contents/ban), [current official Nirdeshika](https://nbr.gov.bd/uploads/news-scroller/Aykor_Nirdashikha_2026-2027_BG_Press_Modify_Copy.pdf).

For conflicts, use the enacted Act and applicable subsequent SROs, with the Paripatra explaining amendments and the Nirdeshika supplying operational examples. A later guide does not override the Act. An article describing the proposed budget is not evidence of the final enacted amounts. Effective dates belong to individual provisions; they should not be inferred solely from a document's title.

### 2.2 At-a-glance web reading

| Source | Why it is useful | How to use it |
|---|---|---|
| [RRH: Key Changes from Finance Bill 2026](https://rrh.com.bd/insights/finance-act-2026-key-changes), 1 July 2026 | Concise comparison of the final Act with the Bill, including revised personal thresholds and reinstated dividend rates. | Best quick overview of what changed at enactment; verify executable rules against P/N/F. |
| [BSS: Parliament passes Finance Bill with changes](https://www.bssnews.net/js-session/400981), 29 June 2026 | Explains why the proposed 375,000 threshold became 400,000 and why older budget reporting differs. | Useful provenance for rejecting proposal-era numbers. Its casual FY wording should not define the API's assessment year. |
| [PwC: Bangladesh individual deductions](https://taxsummaries.pwc.com/bangladesh/individual/deductions), reviewed 31 July 2026 | Independent confirmation of the revised rebate percentages/cap and useful investment-eligibility notes. | Secondary cross-check, not a substitute for exact Schedule 6 conditions. |
| [Dhaka Tribune: First-time return filers and Tk 1,000 minimum](https://www.dhakatribune.com/business/414391/first-time-tax-return-filers-to-pay-tk-1-000), 5 July 2026 | Accessible explanation of the new-taxpayer minimum. | Do not interpret the headline as a flat Tk 1,000 tax for every new taxpayer. |

The official [Finance Acts listing](https://nbr.gov.bd/regulations/acts/finance-acts/ban) and [Finance Act PDF](https://nbr.gov.bd/uploads/acts/Finance_Act_2026.pdf) provide the enacted source. The [official Paripatra link](https://nbr.gov.bd/uploads/news-scroller/Aykor_Poripothro_2026-2027_BG_Press_Modify_Copy.pdf) is also available from NBR. This research is an as-of-date review, not a guarantee that no later notification exists; source revalidation belongs in the eventual publication checklist.

### 2.3 What was and was not verified in the project

- Reviewed [the V2 design document][design], the backend service and formulas, schemas, models, config resolver/service/repository/validation, seed, relevant Alembic history, admin APIs, and relevant admin/public frontend code.
- Ran the two existing tax-related test files: **42 passed, 3 warnings**. These tests largely preserve the existing behavior; passing them does not establish compliance with the new law.
- Reproduced selected failures in memory with the current service and controlled configuration objects. These did not write to a database.
- The working tree was clean at the start of the backend audit. The local Compose status query returned no running services. A subsequent read-only review inspected the deployed public planner and both admin tabs; see section 4.4. No production database rows or worker cache were inspected directly.
- Statements about repository defaults describe fallback/seed behavior. The live values below are those displayed by the admin UI; export the actual rows and compare them before migration. Cache and partial-save risks were identified from code; no production save was attempted.
- No persisted user tax-return/result model was found in the reviewed planner path. Its important existing data are rule tables, browser drafts, cached configuration/results, and any separately retained exports. Do not assume historical filed returns are stored here.

## 3. Legal baseline and change inventory

All monetary amounts below are BDT. These rules concern natural-person calculations; entity and special-source rules need their own eligibility treatment.

### 3.1 Assessment year is a first-class input

For the ordinary case, **AY 2026-27 covers income earned from 1 July 2025 through 30 June 2026**. The return/payment period falls in the following assessment year. The current free-text label `FY 2025-2026` cannot distinguish income year, assessment year, filing date, or provision-effective date. [N, printed 1 / PDF 9.]

Store and return at least `assessment_year`, `income_period_start`, `income_period_end`, and `ruleset_revision`. Filing-date-dependent estimates also need `filing_date` and the relevant taxpayer-status facts. Do not select all rules by today's calendar year.

### 3.2 Personal thresholds and progressive bands

| Eligibility | AY 2026-27 and 2027-28 | Current repository fallback | Required change |
|---|---:|---:|---|
| General individual | 400,000 | 375,000 | Update value and legal-year identity. |
| Woman or person aged 65 or more | 450,000 | 425,000 | Update value; derive senior eligibility consistently. |
| Person with disability or third-gender taxpayer | 525,000 | 500,000 for disability only | Add explicit third-gender eligibility. |
| Gazetted war-wounded freedom fighter or gazetted injured July 2024 warrior | 550,000 | 525,000 under broad `freedom_fighter` boolean | Use the legally qualified categories, not an unrestricted label. |
| Eligible parent/legal guardian of a disabled child/ward | Additional 50,000 per qualifying child/ward | Absent | Track eligible count and the one-parent claim restriction. |

Use the highest applicable base threshold, then the permitted dependent addition. Do not add the female, senior, and disability thresholds together. The age cutoff is 65 inclusive; the correct reference date must be explicit in the profile validation policy. [P, printed 1-3 / PDF 14-16; N, printed 10 / PDF 18; F, PDF 142-143.]

For AY 2026-27/2027-28, the bands **after the applicable zero-rate threshold** are:

| Taxable band width | Rate |
|---:|---:|
| Next 300,000 | 10% |
| Next 400,000 | 15% |
| Next 500,000 | 20% |
| Next 2,000,000 | 25% |
| Remaining amount | 30% |

The current fallback already has these taxable widths and rates. Do not add a 5% band back. The allowance values and other rules are the immediate problems.

The Act also schedules future changes, which make versioning useful now:

| Assessment years | General / woman-senior / disability-third gender / qualified fighter thresholds | Upper-rate change |
|---|---|---|
| 2028-29 and 2029-30 | 450,000 / 500,000 / 575,000 / 600,000 | After the first four taxable bands, next 26,350,000 at 30%, remainder at 35%. |
| 2030-31 | 500,000 / 550,000 / 625,000 / 650,000 | After the first four taxable bands, next 26,300,000 at 30%, remainder at 35%. |

These are future schedules, not instructions to apply 35% to AY 2026-27. Retain the personal allowance as a separate rule, so profile changes do not accidentally change taxable band widths. [P, printed 3-5 / PDF 16-18; F, PDF 143-144.]

### 3.3 Investment rebate: changed parameters and a pre-existing base defect

The entitlement is:

```text
A = qualifying total income after statutory exclusions,
    before subtracting the personal zero-rate threshold
B = eligible investments and expenditure after category rules/caps
statutory_rebate = min(0.03 * A, 0.10 * B, 750000)
```

`A` excludes exempt income, income subject to reduced rates, partnership/AOP share income, and income with final tax liability. It is not raw gross receipts and not the current API's `taxable_income` after allowance. `B` is not the sum of every savings or asset value entered by a user. [P, printed 61-63 / PDF 74-76; N, printed 52-54 / PDF 60-62; F, PDF 76, amendment to section 78.]

The 2026 changes reduce the investment factor from 15% to 10% and the cap from 1,000,000 to 750,000. The 3% factor remains. Do not restore the old separate eligible-investment percentage cap removed by the project's previous simplification; implement the present three-way formula and category rules.

Keep separate values for statutory entitlement, tax actually reduced, and the effect of a statutory minimum. N's example 22 explicitly shows entitlement exceeding slab tax before the minimum is applied. Capping the displayed entitlement at gross tax loses that explanation, even if a later liability clamp prevents a negative payment.

### 3.4 Individual minimum tax

- General national minimum: **5,000**, independent of location.
- Eligible new taxpayer: **1,000 minimum**, not a 1,000 ceiling or flat tax.
- Trigger: total income exceeds the person's applicable tax-free threshold.
- The floor still matters when rebate reduces ordinary calculated tax to zero or below.
- If income does not exceed the threshold, do not create a 5,000 liability merely because a minimum is configured.

The new-taxpayer definition must be supported by the relevant registration/return facts. A new app account, recently saved draft, or missing prior record is not evidence of eligibility. N example 22 gives an explicit new-taxpayer case. [P, printed 2-3 / PDF 15-16; N, printed 52 and 59-60 / PDF 60 and 67-68.]

This is an opportunity to remove the location dropdown and three location amount fields from the **2026-27 ruleset editor**, while retaining legacy location policies only where a supported historical year requires them.

### 3.5 Employment income

The general employment exemption remains the lower of one-third of qualifying employment income and **500,000**. The current cap is not obsolete. However, the input base must exclude qualifying items before this calculation, including the applicable group-insurance/medical and official-duty reimbursement exclusions. Employer-paid group-insurance premiums and qualifying medical reimbursement amendments are described in P; group-insurance benefits are excluded in N example 23. [P, printed 30 and 135 / PDF 43 and 148; N, printed 20-21 and 60-61 / PDF 28-29 and 68-69.]

Government pay-order employees have a different salary treatment: specified allowances are exempt, while basic pay, festival allowance and bonus are taxable as prescribed. They do not simply receive the general one-third deduction on the current three-field aggregate. Government pension, gratuity, and other exempt receipts also need classification rather than inclusion in `other_income`.

The initial aligned engine can support the general/private employment route and require normalized taxable income or explicitly reject unsupported employment subtypes. It must not silently apply the private route to everyone.

### 3.6 Eligible investment categories

| Category | Required treatment | Current gap |
|---|---|---|
| Deposit pension scheme | Qualifying annual DPS contributions capped at **120,000 in aggregate**. | `dps_or_savings` accepts an uncapped total and its name implies ordinary savings qualify. |
| Government securities, including qualifying savings certificates | Aggregate eligible investment cap **500,000** for the statutory group. | `sanchayapatra` has no cap or acquisition/maturity information. |
| Unit certificates, mutual funds, ETFs and qualifying collective schemes | Qualifying **new investment**; the previous 500,000 cap for this group was replaced. | No distinction between new investment and old holdings; must not copy the government-securities cap here. |
| Listed shares/stocks/debentures and eligible listed investments | Qualifying new investment, with statutory instrument conditions. | A single `stock_market` value cannot distinguish contribution, old cost, market value, and unrealized gains. |
| Provident fund | Separate government PF and recognized PF treatment; eligible employee/employer contributions as applicable. | Generic PF total has no recognized-fund qualification. |
| Life insurance / deferred annuity | Qualifying policy, covered relationship and sum-assured limit; preserve exact Schedule 6 wording. | Unqualified premium total; no policy data or cap. |
| Welfare/group insurance/approved superannuation and other statutory schemes | Distinct eligible contributions and approval conditions. | Only catch-all fields; eligibility cannot be validated. |
| Zakat funds and approved donations | Qualifying recipient, payment, approval, date and legal route. | One unrestricted donation number cannot establish these facts. |

[N, printed 11 and 53-58 / PDF 19 and 61-66; P, printed 135-136 / PDF 148-149.]

Additional distinctions:

- A donation to **Centre for Zakat Management through bank transfer** is a Schedule 6 Part 2 income deduction. It is not automatically another investment-rebate item. N example 20 deducts 70,000 from total income before computing the rebate base. Prevent double claims through the donation field. [P, printed 135 / PDF 148; N, printed 57-58 / PDF 65-66.]
- The added list of 11 approved charitable organizations is subject to its SRO and validity period through 30 June 2030. Store legal recipient identifiers/approval dates, not only labels. [P, appendix 4, printed 221 / PDF 234; N, printed 53-54 / PDF 61-62.]
- Government securities and the specified unit/fund investments have full-term holding requirements. Premature encashment can require recovery of the attributable earlier rebate in the encashment year. Track investment date, maturity, disposal date and prior rebate if this is supported; otherwise flag the case. The amendment's 1 July 2026 effective date needs a deliberate transition policy for older holdings. [P, printed 136 / PDF 149; N, printed 52 and 59 / PDF 60 and 67.]
- Do not count FDR principal, ordinary savings balances, laptop purchases, or unchanged portfolio market value as investment rebate merely because the user entered them in an investment card. N example 20 demonstrates exclusions.
- A quick-mode total can remain as an **already validated eligible total** with explicit assumptions, mutually exclusive with itemized entries. It cannot promise category validation without category facts.

### 3.7 Income requiring a different calculation path

| Income / situation | Relevant rule | Required handling |
|---|---|---|
| Individual dividend income | Schedule 7 prescribes 15%; P states the amendment applies from 1 July 2026. | Dedicated special-rate component and effective-date policy; exclude from the ordinary progressive/rebate base as applicable. Do not infer final-tax status solely from an identical withholding percentage. |
| Eligible ordinary investor's listed capital gains | N illustrates a 5,000,000 exemption and 15% on excess realized gains. Sponsor/director and other categories require separate qualification. | Realized gain from sale and cost, not portfolio appreciation or gross sale proceeds. Preserve exemption and special-rate components. |
| Other capital gains | The documents include 5% for specified personal precious-metal/jewelry gains and special rules for developer arrangements. | Instrument/transaction-specific strategy; no universal 15% capital-gains shortcut. |
| Rental income | Revised property-rent computation includes annual value/receipts, tenant-paid services, supported vacancy, deductible expenses, certain deposits and salami. | Explicit gross-rent-to-taxable-rent calculation or an acknowledged precomputed net input. |
| Business/professional income | Net taxable profit, allowable expenses, depreciation, source-specific losses, exemptions and potentially turnover tax. | Separate profit from gross receipts; never apply a turnover threshold to net profit. |
| Freelancing/content creation and qualifying SME income | Conditional exemptions were expanded; required registration/banking/other conditions remain relevant. | Evidence-based exemption classification; neither automatically tax all such income nor exempt all online work. |
| Non-resident / foreign-national cases | Residence and Bangladeshi nationality affect applicable treatment and rebate eligibility. | Explicit support decision and profile facts. A warning followed by resident arithmetic is insufficient. |

[P, printed 31-34, 135-137 / PDF 44-47, 148-150; N, printed 28-31, 43-46 and 58 / PDF 36-39, 51-54 and 66; F, PDF 123-124 for Schedule 7 amendments.]

For rental income, the sources describe 25% non-commercial and 30% commercial statutory expense allowances, other permitted deductions, special rental income for unspent allowances, treatment of 10% of specified year-end deposits, and allocation of non-refundable salami over the applicable period, capped at five years. These cannot be inferred from one `rental_income` number. Defer a full rental worksheet if necessary, but explicitly label any accepted number as already computed taxable rent and keep special components separate.

The expanded SME exemption covers qualifying women-owned and disability-owned small/medium industries with annual turnover not exceeding 7,000,000 and SME Foundation registration. Do not expose this as an unqualified gender-based business exemption. [P, printed 135 / PDF 148.]

### 3.8 Withholding, advance tax, final tax and turnover tax

The replacement section 163 simplifies the prior source-tax minimum framework. Part 7 withholding is generally treated as advance tax with adjustment/refund/carry-forward mechanisms. Important exceptions remain, including section 138/139 vehicle/vessel-source treatment and withholding for persons not required to file under section 166(2). The higher declared-income liability rule and restrictions for personal vehicle advance tax must also be respected. [P, printed 82-89 / PDF 95-102; N, printed 73-74 / PDF 81-82; F, PDF 89 onward.]

Therefore:

- Add source-tagged withholding and advance-payment credits; do not just subtract an unqualified total everywhere.
- Distinguish tax liability, allowable credits, net payable, and potentially refundable/carry-forward excess.
- Keep final-tax sources and restricted vehicle credits separate.
- Do not rebuild the old many-source minimum-tax buckets as the default new architecture.
- Do not make all excess tax automatically refundable. Eligibility and credit restrictions still matter.

For the ordinary category under section 163(6), the later **SRO 324-Law/Income Tax-05/2026, 31 August 2026** gives:

| Gross receipts | Turnover tax rate on gross receipts |
|---:|---:|
| Up to 20,000,000 | 0% |
| Above 20,000,000 through 40,000,000 | 0.50% |
| Above 40,000,000 | 1% |

This is a rate applied to the relevant **whole gross-receipts base**, not marginal personal-income slabs. Compare with regular business-attributable tax under the applicable rule; model carry-forward and special-sector/exemption provisions separately. Special industries and new industrial undertakings have different rates; the table is not universal. [P, printed 84-85 / PDF 97-98 and appendix 5, printed 222 / PDF 235.]

The personal 5,000/1,000 minimum, business turnover tax, final source tax, and restricted vehicle advance tax are different legal concepts. A single configurable `minimum_tax` amount cannot represent them.

### 3.9 Filing-date incentive and additional tax

For the ordinary applicable AY 2026-27 case:

| Return filing window | Adjustment to the applicable section 173 payable amount |
|---|---|
| 1 July-30 September 2026 | Incentive: lower of 5% and 25,000. |
| 1 October-31 December 2026 | No adjustment under these window rules. |
| 1 January-31 March 2027 | Additional tax: higher of 2% and 3,000. |
| 1 April-30 June 2027 | Additional tax: higher of 5% and 5,000. |

P's example 30 first subtracts 15,000 withholding from 60,000 tax, then calculates the early-filing incentive on 45,000: incentive 2,250 and payable 42,750. This establishes why an engine with no credits cannot implement the timing adjustment reliably. [P, printed 92-95 / PDF 105-108; N, printed 60-62 / PDF 68-70.]

First-time filers, return-from-abroad cases, non-working days and applicable extensions require their legal exceptions. After 30 June 2027, section 174 introduces a different late-return regime, including additional tax and possible loss of certain exemptions, with protected exemptions and other interest/penalty provisions. Do not extend the April-June formula indefinitely or implement a generic late fee. [N, printed 69-72 / PDF 77-80; P, printed 98-102 / PDF 111-115.]

As of this audit's date, the ordinary window is October-December. Do not show the expired July-September incentive as presently available. Likewise, investments made now cannot automatically be claimed against the ordinary income year that ended on 30 June 2026.

### 3.10 Wealth surcharge and environmental surcharge

The individual wealth surcharge schedule is:

| Relevant net assets / trigger | Surcharge rate |
|---|---:|
| Net assets up to 40,000,000, without an alternative trigger | 0% |
| Above 40,000,000 through 100,000,000; or more than one qualifying motor car; or house property exceeding 8,000 sq ft | 10% |
| Above 100,000,000 through 200,000,000 | 20% |
| Above 200,000,000 through 500,000,000 | 30% |
| Above 500,000,000 | 35% |

Use section 167 reportable net assets and qualifying vehicle/property definitions. Do not reuse a mark-to-market portfolio/net-worth screen without reconciling valuation and liabilities. The surcharge is calculated on the legally specified tax base, not on wealth itself or the balance after withholding. The exact rebate/minimum/surcharge sequence needs a dedicated fixture before implementing a general settlement function. [P, printed 8-11 / PDF 21-24; N, printed 62-64 / PDF 70-72.]

Environmental surcharge is a separate vehicle-based levy for multiple qualifying vehicles. The schedule runs through 25,000 / 50,000 / 75,000 / 150,000 / 200,000 / 350,000 by engine-capacity bands. The lowest-charge vehicle is excluded as prescribed; electric vehicles are exempt under the current rule. This levy is not a general income-tax credit or refund. It needs vehicle details, not a boolean car-owner flag. [P, printed 10-11 / PDF 23-24; N, environmental surcharge discussion and examples following printed 64.]

These are existing coverage gaps as well as areas affected by current rules. If the first release does not calculate them, detect the trigger and mark the total as incomplete instead of silently presenting `final_tax` as complete.

## 4. Current implementation findings

Priority means: **P0** blocks a credible current-year calculation/publication path; **P1** is necessary for the declared broader income/filing scope; **P2** improves maintainability or expands explicitly guarded coverage. A deferred P1 scenario must be rejected or clearly identified as incomplete.

### 4.1 Calculation and input contract

| ID | Priority | Evidence and impact | Proposed correction |
|---|---|---|---|
| C01 | P0 | [Service line 64][service64] subtracts allowance, then passes that value to rebate at line 82. Valid users can be overcharged after all admin numbers are updated. | Separate `rebate_income_base` from `income_above_zero_rate_threshold`. Implement section 78 exclusions. |
| C02 | P0 | [Fallback configuration][fallback] still labels 2025-2026 and uses outdated thresholds, 15%, and 1,000,000. | Introduce verified AY 2026-27 defaults/ruleset; do not merely rename the label. |
| C03 | P0 | [Minimum-tax resolver][minimum] immediately returns zero when post-rebate tax is non-positive and prioritizes location. | Trigger from total income versus allowance; national/new-taxpayer policy independent of post-rebate sign. |
| C04 | P0 | [Profile schema][profile] has `age`, but [allowance resolution][allowance] never reads it. A 65-year-old with `senior_citizen=false` gets the general threshold. | Derive/validate senior status and reference date; reject contradictory facts. |
| C05 | P0 | Profile has no third-gender, injured-July-warrior, or qualifying-disabled-dependent claim. `freedom_fighter` is too broad. | Add precise eligibility fields, mutual/overlap rules and dependent claims. Preserve older drafts as requiring review. |
| C06 | P0 | [Investment aggregation][investment] sums values without statutory caps and adds arbitrary simulated investment. DPS can be over-credited. | Category eligibility policy and aggregate cap groups, then calculate B. Simulation must pass the same rules. |
| C07 | P0 | Detailed mode can sum `tax_saving_investments` plus itemized categories. Quick mode bypasses category enablement using the total. | Mutually exclusive normalized-total and itemized modes; no double counting or hidden bypass. |
| C08 | P0 | [Other-income aggregation][otherincome] sends dividend, rent, business, interest and catch-all receipts through one progressive path. | Income classification and separate ordinary/special/final/exempt components; block unsupported inputs. |
| C09 | P1 | [Employment calculation][service46] applies the same one-third exemption to all salary/benefit inputs. | Employment subtype, separately excluded receipts, and government-pay treatment or explicit scope guard. |
| C10 | P1 | Request/response have no withholding ledger, advance credits, filing date, surcharge facts or settlement components. | Extend backend contract; separate annual tax liability from amount due at filing. |
| C11 | P1 | Non-resident status generates an informational insight but still returns resident arithmetic. | Implement the applicable policy with nationality/residence facts, or reject unsupported estimates. |
| C12 | P0 | [Formula helper][rebateformula] calculates maximum available rebate and potential savings without tax/floor capacity. The service reports a minimum as applied even when it did not bind. | Derive realizable savings by recomputing final liability; expose `floor_amount`, `floor_binding`, and `floor_top_up`. |
| C13 | P1 | Decimal inputs have no domain bounds at the request fields; negative values are silently clamped by `_non_negative`. Legitimate losses are indistinguishable from invalid receipts. | Reject invalid receipt/contribution values; introduce separate, qualified loss/set-off inputs if supported. |
| C14 | P1 | Public result contains assumptions strings but no immutable ruleset/version/hash. | Return year, revision, engine policy version, exclusions and calculation trace. |

The current pure Decimal-based formulas, injectable resolved config, slab breakdown, and separation of public/admin routes are useful foundations. They can be retained. The problem is the meaning and completeness of their inputs and rules, not the need to rewrite the whole wealth module.

### 4.2 Admin configuration, storage and cache

| ID | Priority | Evidence and impact | Proposed correction |
|---|---|---|---|
| A01 | P0 | [Models][models] permit one settings row per country; slabs/categories are global. Tax year is only text. | Scope all legal values to an immutable ruleset revision and real assessment year. |
| A02 | P0 | [Admin UI save][adminsave] uses separate scalar/slab mutations with `Promise.all`; each [service method][configservice] commits independently. One successful request and one failure leave partial changes. | One aggregate draft payload and one atomic publish transaction. |
| A03 | P0 | [Resolver][resolver] uses a class dictionary keyed only by country; invalidate clears only the serving process. Gunicorn/Compose default to two workers. | Revision-aware shared resolution or uncached reads; no indefinitely stale worker. |
| A04 | P0 | [Slab validation][validation] checks only unique order and one allowance band. It does not validate rates, widths, terminal coverage or allowance position. | Structural and numerical validation before saving/publishing; fail closed on invalid stored data. |
| A05 | P0 | Rebate validation only requires non-negative numbers, not bounded percentages. Model string lengths and input lengths are not consistently aligned. | Decimal precision, percentage bounds, finite values, string limits, dates and semantic cross-field checks. |
| A06 | P0 | `is_enabled`, presented as **Visible**, also excludes that category from the backend investment sum. | Separate presentation visibility from legal eligibility. A cosmetic admin change must not remove a valid tax credit. |
| A07 | P1 | Missing category rows are merged back as enabled. Category writes check known keys/order but not a complete unique-key set. | Explicit full-snapshot or patch semantics; reject duplicate keys; deterministic omission semantics. |
| A08 | P0 | Missing settings/slabs select [Python fallback][fallbackresolver] with **no minimum-tax rules** and outdated parameters, potentially combined with database categories. | Require one complete valid ruleset; controlled same-year fallback only, explicitly identified. No hybrid rules. |
| A09 | P1 | [Repository][repository] deletes rows, then inserts replacements through a helper that flushes. Unique order/key constraints make flush ordering important. | Prefer ruleset-scoped insertion or upsert. Add a real DB test for repeated saves; potential unique-constraint collision is not runtime-confirmed in this audit. |
| A10 | P0 | [Seed][seed] inserts missing sets; it does not upgrade existing scalar rows or existing slabs. | Separate bootstrap from explicit, idempotent new-ruleset creation. Export/diff current DB values before migration. |
| A11 | P1 | No preview, change reason, legal source per rule, complete audit history, optimistic lock or immutable published revision. Slab update discards actor identity. | Draft/validate/preview/publish; revision conflict detection; retain actor, timestamp, reason and exact published snapshot. |
| A12 | P1 | Public config omits thresholds/slabs and rule revision, while calculation uses them. Unknown country lookups can fall back to Bangladesh rules with global rows. | Return the relevant resolved contract and revision; explicitly restrict supported countries. |

Authorization is already appropriately separated: admin reads and super-admin writes exist, and the UI uses a super-admin route. Retain this. The main admin risks are tax semantics, validation, atomicity, and propagation rather than a need to invent new roles.

### 4.3 Frontend consequences that must follow the backend contract

- [Rebate helper][frontendrebate] retains 3%/15%/1,000,000 fallback values and builds the displayed explanation using `result.taxable_income`. It can combine new public config with an older calculation result. Return the actual applied formula/base from the backend instead.
- [Calculation hook][frontendhook] caches by payload, retains previous data, and uses an unversioned `wealth.taxPlanner.v1` browser draft. A ruleset change is not part of either identity.
- [Public config hook][frontendconfighook] has an independent 60-second cache. Admin save invalidation does not establish a global calculation-version change for all users.
- The current workspace merges/simplifies some fields and has an old FY fallback label. An API field not visible in the newest form is still part of the backend contract; hidden dividend/rental fields cannot justify incorrect API arithmetic.
- Guide/localization text and minimum-tax journey messages need the same corrected definitions. The V2 documentation's fixed profile-priority description also differs from the actual maximum-of-applicable-thresholds implementation.
- Investment suggestions need dates and a distinction between historical what-if and still-available planning. Do not tell a user filing AY 2026-27 in November 2026 that a new investment now will reduce tax for income earned before July 2026.

### 4.4 Live UI review and proposed screens

Reviewed [the public planner](https://stockwealthbd.com/wealth/tools/tax-planner) and [the admin editor](https://stockwealthbd.com/admin/tax-planner) on 5 November 2026. The review covered Quick estimate, all four Detailed planner steps, expanded income cards, the result journey and simulation controls, and both admin tabs. No inputs or production settings were saved. These are observations of the signed-in desktop session; mobile and publication behavior remain acceptance checks.

**Observed public behavior.** The header says `FY 2025-2026`. Quick estimate accepts gross annual salary, other annual income (with freelance, rent and bonus in the same hint), and one investment total. Detailed uses Tax Area and four broad special-category checkboxes; income cards expose a combined employment amount, annual business/freelance profit, combined bank/FDR/DPS/savings interest, and Other Taxable Income. Review shows a location/profile and totals, without a rules revision or separate credit/filing information. Investments include “DPS / Savings” and “Other Eligible Investment” without showing statutory eligibility or aggregate caps in the category list.

The open salary-only scenario showed Tk 900,000 gross salary, Tk 300,000 employment exemption, Tk 600,000 before allowance, Tk 400,000 allowance and Tk 20,000 tax with zero investment. The snapshot and slider advertised Tk 6,000 saving from Tk 40,000 investment. In Detailed, the investment tips separately showed 15%, a Tk 27,000 income limit and an approximate Tk 180,000 target, while the result still showed the previous numbers. The confidence badge rose from “Good” to “Strong” on switching modes without adding tax facts. This demonstrates conflicting guidance in the rendered UI; it does not establish which deployment worker or cache produced each number.

For that same ordinary existing-taxpayer scenario under the proposed rules, the 3% income limb is Tk 18,000 and the Tk 5,000 floor leaves at most Tk 15,000 of usable savings. A hypothetical Tk 40,000 eligible investment during the applicable income period yields Tk 4,000 rebate and Tk 16,000 annual liability. Tk 150,000 of eligible investment would reach the floor, subject to category and timing rules. This is a useful shared UI/backend fixture. The closed income period makes it a historical comparison, not a prompt to invest now.

**Observed admin values.** This deployment differs from the repository seed:

| Control | Displayed value | Proposed AY 2026-27 treatment |
|---|---|---|
| Tax year / display name | 2025-2026 / FY 2025-2026 | Explicit assessment year and separate income period; derive header from the published revision. |
| General threshold / allowance row | 400,000 / 375,000 at 0% | Keep the verified general threshold; derive the zero-rate row per profile and remove its editable duplicate. |
| Woman/senior, disability, freedom fighter | 425,000 / 500,000 / 525,000 | 450,000 / 525,000 / 550,000 with the qualifications and dependent addition in section 3.2. |
| Rebate | 3% / 15% / 1,000,000 | 3% of qualifying income before allowance / 10% of eligible investment / 750,000. |
| Minimum tax | National and Dhaka/Chattogram 5,000; other city 4,000; outside city 3,000 | National and eligible-new-taxpayer policies; remove location amounts from this year's form. Replace the stale V1 notice with an explanation of the trigger. |
| Salary exemption and taxable bands | 500,000 cap; 10/15/20/25/30% with the expected taxable widths | Retain; make employment policy explicit and keep terminal-band coverage visible. |
| Investment Categories | Eight visible rows, each with code, label, order and Visible; separate Save changes | Separate display from legal policy. Add per-year source, cap group, date range and preview of accepted/rejected amounts. |

**Public screen proposal.** Keep Quick and Detailed with a shared calculation contract and result. A compact header should read “Assessment year 2026-27 · Income earned 1 Jul 2025–30 Jun 2026,” with a rule-source link and clear closed/open period status. Show only years with a published supported revision.

| Screen | Proposed controls and behavior |
|---|---|
| Quick estimate | Keep three amounts for the ordinary private-employment case. Rename the second to “Other ordinary taxable income, excluding salary/bonus already entered”; label the investment total as already checked for eligibility. State the default profile and credit assumptions beside the result. Offer “Add special income, credits or taxpayer details” to carry values into Detailed. |
| Detailed: Profile | Replace Tax Area for this year with precise threshold qualifications, senior eligibility, eligible dependent count and claim confirmation. Ask about new-taxpayer status using legal facts; unknown status should prompt for clarification or show conditional results. Gate unsupported residence/profile cases. |
| Detailed: Income | Keep expandable source cards. Separate private and government employment and excluded receipts; distinguish business profit from turnover and gross rent from precomputed taxable rent. Separate deposit interest from principal, dividends and realized gains from ordinary income. Show unavailable treatments explicitly and preserve edits when switching modes. |
| Detailed: Investments | Use dated category cards with “Entered / eligible / excluded” and reasons. Rename DPS / Savings to “Eligible DPS contributions,” show remaining shared cap, and distinguish government securities from new fund and listed investments. Route eligible CZM deductions through income deductions. Require confirmation before converting an existing aggregate to itemized values. |
| Detailed: Credits and review | Add withholding/advance credits by source and optional planned filing date when supported. Review classifications, excluded amounts and unresolved facts with direct Edit links. Do not display a full amount due if credits or special-source treatment are incomplete. |
| Result and simulator | Lead with annual liability and show estimated balance at filing only when settlement inputs are sufficient. Expand into income and deductions, allowance and slabs, statutory rebate and usable reduction, floor, special tax/surcharge, credits and filing adjustment. Replace confidence stars with concrete missing facts or “Ordinary estimate.” For a closed income period, label scenarios “Historical what-if.” For open periods, show the selected eligible category and backend-calculated marginal savings. |

**Admin screen proposal.** Start with an assessment-year selector and a read-only Published view showing revision, effective dates and source citations. “Create draft” copies the selected revision into a clearly marked editable view. Group fields by profiles and bands, employment and rebate, investment eligibility, minimum tax, and supported settlement policies. Give administrators a profile preview and inline validation for missing tail bands, conflicting dates, duplicate categories and unsupported policy changes. Category label/order/visibility settings should sit apart from legal caps and eligibility, with copy explaining which settings change calculations.

Use a single action bar: **Save draft → Validate and preview → Publish revision**. Preview displays old/new values, user-facing English/Bangla labels, and before/after fixture outputs with liability changes and reasons. Publication confirmation identifies the exact year and revision. Show a clear conflict message if another editor publishes first, preserve unsaved draft values for review, and keep publication history with a compare view. The public screen must switch coherently after publication; a successful local Save toast does not prove rollout across workers.

**Frontend/backend handoff.** Render thresholds, category eligibility, accepted/excluded amounts, limiter reasons, remaining savings, and settlement totals from the same revision returned by the backend. The public client should include year/revision in calculation requests and cache keys; mark prior results stale while recalculating and never combine them with updated tip text. Keep currency entry/display and translation in the UI, and derive legal calculations and scenario outputs on the server. Migrate browser drafts using section 8.3; keep ambiguous old inputs pending review. Align EN/বাংলা strings, guide steps, labels and tooltip definitions. On mobile use a single-column flow and accessible expandable summaries; verify keyboard navigation, focus on validation errors, and that dynamic results are announced without repeatedly interrupting input.

**UI release checks.** Verify Quick and Detailed parity for identical facts; the Tk 900,000 scenario above; government examples 18, 22 and 23 in section 10; unsupported/partial results; exact assessment-year labels and closed-period behavior; migration of a mixed aggregate/itemized draft; no arithmetic differences between EN and বাংলা; and an admin preview, failed publish and successful publish against staging, including matching public revision and results across workers.

## 5. Reproductions and expected differences

The following are **in-memory service checks**, not observations of live database settings. Two configurations were compared: (a) repository defaults plus the seed-style national/location minimums; (b) only the four thresholds and rebate parameters changed to the new numbers, with a national minimum. The second column demonstrates why an admin-only update is insufficient.

Unless stated otherwise, examples are resident general-category individuals, contain only ordinary income and eligible investments, and exclude surcharge, timing adjustments and credits. Amounts are BDT.

| Case | Current/default-style result | New scalar values only | Legally aligned expected result |
|---|---:|---:|---|
| Salary 1,200,000 plus ordinary other income 100,000; investment 300,000. Salary exemption 400,000, so total income 900,000. | Tax 48,000 | Tax 45,000 | Gross tax 60,000; rebate min(27,000, 30,000, 750,000) = 27,000; liability **33,000**. |
| N example 18: female, already-computed ordinary taxable sources total 980,000; eligible investment 317,000. | Tax 51,600 | Tax 48,600 | Gross 64,500; rebate **29,400**; liability **35,100**; less source tax 6,400 = **28,700 payable**. |
| Age 65, `senior_citizen=false`, ordinary income 430,000, no investment. | Tax 5,500 | Tax 5,000 | Applicable threshold 450,000, so **zero**. |
| Existing taxpayer, rural location, ordinary income 405,000, no investment. | Tax 3,000 | Tax 5,000 | **5,000** irrespective of location; eligible new taxpayer would instead have the **1,000** floor. |
| Ordinary income 2,000,000; DPS contributions 240,000, no other investment. | Tax 260,250 | Tax 266,000 | Eligible DPS 120,000; rebate 12,000; gross 290,000; liability **278,000**. |

For the N example 18 reproduction, the 980,000 input deliberately bypassed salary preprocessing. It isolates the rebate-base defect; it does not claim that the existing service correctly handles that example's government employment income.

Additional confirmed behavior:

- An itemized request containing aggregate investment 100,000 and life-insurance investment 100,000 totals **200,000**. The API has no mechanism to know whether the aggregate already includes the insurance.
- `_resolve_minimum_tax(..., tax_after_rebate=0)` returns no floor. N example 22 requires 1,000 for an eligible new taxpayer even after a larger statutory rebate. The existing wrong rebate base can mask this defect in ordinary default scenarios; fix both together.
- A slab configuration consisting only of an allowance row passes the present validator. With a 400,000 allowance and no taxable tail, a 5,000,000-income request can produce **zero tax**. This is a configuration integrity defect, independent of yearly rate updates.
- With total income 900,000 and investment 150,000, the scalar-only result happens to be the correct 45,000 because investment is the binding limit. However, it reports no remaining rebate opportunity. On the correct 900,000 base, further qualifying investment up to a total 270,000 can reduce liability by another 12,000, before other constraints. A few passing ordinary examples can therefore hide the wrong base.

## 6. Proposed backend design

### 6.1 Calculation pipeline and distinct quantities

Use a deterministic calculation over a validated request and one immutable resolved ruleset. The following is a design sequence, not a universal executable ordering for every special source:

1. Resolve assessment year, revision and supported taxpayer profile.
2. Classify source amounts into exempt, ordinary, reduced/special-rate, and final-tax components. Apply head-specific deductions and permitted losses.
3. Derive the personal zero-rate threshold and qualifying dependent addition.
4. Compute ordinary progressive tax and each supported special-source tax separately.
5. Derive section 78 base A independently of the zero-rate band. Normalize investments, cap groups and deductions to produce B.
6. Calculate statutory rebate and its legally usable effect. Apply individual-floor policy and source/business minimum/final-tax rules where applicable, preserving a trace of each comparison.
7. Calculate applicable surcharges using their statutory bases. Keep environmental surcharge separate.
8. Apply eligible withholding/advance credits under the source-specific settlement policy; retain excess separately.
9. Apply the applicable filing-date incentive/additional-tax policy on its legal base, then report payable/refundable/carry-forward components.
10. Re-run the same pipeline for a planning scenario and compute the difference in payable/annual liability, rather than estimating savings from a percentage alone.

The implementation must settle source interactions and surcharge ordering with fixtures before enabling those cases. Do not collapse the entire sequence into `max(gross_tax - rebate, minimum) - all_credits` for every taxpayer.

Recommended calculation outputs:

| Group | Important fields |
|---|---|
| Identity | `assessment_year`, `income_period`, `ruleset_id`, `ruleset_revision`, `engine_policy_version`, `calculation_schema_version` |
| Scope | `supported`, `unsupported_reasons`, `assumptions`, `missing_required_facts` |
| Income | Gross receipts by head, exclusions/deductions, ordinary income, special-rate income, final-tax income, exempt income |
| Threshold | Applied base category, dependent addition, total threshold, income above threshold |
| Rebate | A, B, accepted/rejected investment amounts by category, each of the three limits, statutory entitlement, effective reduction |
| Tax | Slab breakdown, special-source tax, floor amount, binding flag/top-up, turnover comparison, surcharge components |
| Settlement | Credits claimed/allowed/restricted, section 173 balance, timing adjustment, payable, possible refundable/carry-forward excess |
| Planning | Scenario revision, added eligible investment, eligible period, realized tax difference, binding constraint |

Use `Decimal` throughout. Define rounding at each legally relevant step and reconcile with NBR examples; do not let frontend floating-point arithmetic become the authoritative result.

### 6.2 Minimal ruleset versioning

Evolve the current tables instead of introducing dozens of tiny singleton tables:

| Current object | Proposed responsibility |
|---|---|
| `tax_planner_settings` | A ruleset header with country, assessment year/income dates, revision, status, engine policy version, legal parameters, source references, publication metadata and content hash. Unique `(country, assessment_year, revision)`. |
| `tax_slabs` | FK to ruleset; unique `(ruleset_id, sort_order)`; taxable widths/rates only. Derive the zero-rate band from the profile policy. |
| `tax_investment_categories` | FK to ruleset; unique `(ruleset_id, category_key)`; typed eligibility policy reference, cap group/amount, effective dates and display settings. |
| Publication/audit record | A small separate event table, or equivalent immutable records, for actor, reason, prior/new revision, validation outcome and exact changes. |

Maintain one selected published revision per country/assessment year. Superseded revisions remain readable for explanation/reproduction. A published revision must not be edited in place. A correction creates a new revision.

The current V2 deliberately removed fiscal-year history and publishing. Reintroduce only the minimum necessary versioning: **draft -> validated preview -> atomic publish**. The enacted multi-year schedules, dated SROs, old drafts, and multi-worker operation now justify this change.

Bounded typed JSON sections are acceptable for coherent rule families if validated by explicit Pydantic models and engine-supported policy identifiers. Avoid arbitrary JSON objects or executable admin formulas. A decimal/rate update should be configuration; a new meaning of income, eligibility or tax ordering may require a new engine policy version and deployment.

### 6.3 What should be configuration versus code

| Admin-configured, typed and dated | Implemented and tested in code |
|---|---|
| Threshold amounts; senior cutoff parameter; dependent increment | Eligibility derivation, overlap resolution and dependent-claim rules |
| Taxable band widths/rates | Progressive-band traversal and coverage validation |
| 3%, 10%, 750,000 and category caps | A/B classification, three-way minimum and usable-rebate calculation |
| Individual minimum values and supported policy selection | Trigger above threshold; new-taxpayer eligibility; floor placement |
| Dividend and other supported special rates | Which source qualifies, realization rules, exclusions and interactions |
| Filing windows, percentages, caps/minima | Section 173 base, exceptions and date-boundary behavior |
| Turnover thresholds/rates and sector identifiers | Gross-base calculation, comparison, exemption and carry-forward logic |
| Surcharge schedules and vehicle bands | Legal asset valuation, triggers, exclusions and tax-base ordering |
| Instrument/recipient approvals and validity periods | Evidence requirements, no duplicate claim, acquisition/encashment handling |
| Labels, help text and UI visibility | Presentation must not decide legal eligibility |

### 6.4 Validation and config resolution

Required publication validation:

- Every required rule family exists and is compatible with the declared engine policy version.
- Rates are finite and within allowed bounds; amounts have permitted precision and non-negative values where appropriate.
- Taxable bands have positive finite widths except exactly one terminal unbounded band; ordering is valid and all income is covered.
- If compatibility temporarily retains an allowance row, it must be first, zero-rate, unique and derived consistently. Remove redundant editable allowance amounts when possible.
- No duplicate category key or order; required categories cannot disappear silently. Explicitly distinguish full replacement from patch semantics.
- Cap groups apply across duplicated accounts/instruments; no per-card resetting of DPS/securities caps.
- Assessment/income dates are valid; provision dates and source citations are present; future schedules do not leak into current-year selection.
- A full proposed snapshot passes government-example fixtures and representative boundary cases before publish.
- Optimistic concurrency rejects publication against a stale revision.

Cache one complete snapshot by `(country, assessment_year, revision, engine_policy_version)`. Obtain the current published revision from a shared source, or simply read these small tables without a process-local indefinite cache. A read must not combine new scalars with old slabs/categories. An invalid/missing ruleset should return an explicit unavailable/unsupported result; a compiled fallback is acceptable only if it is a complete, validated snapshot for the requested year and is identified in the response.

## 7. Admin panel alignment

### 7.1 Concrete editor changes

| Current editor | Proposed editor |
|---|---|
| Free-text tax year/display name | Select assessment year; show income period separately; edit a draft revision. |
| Four broad threshold amounts | Qualified categories, senior age rule and disabled-dependent increment, with overlap explanation. |
| Editable allowance slab plus other bands | Threshold summary plus taxable bands only; preview applied allowance for each profile. |
| Income rebate percentage labelled generically | Label **3% of qualifying total income before the personal zero-rate threshold**; show the exclusions and all three limits. |
| Dhaka/other city/rural minimums | For AY 2026-27: national 5,000 and eligible-new-taxpayer 1,000, with explicit trigger and policy. |
| Category `Visible` controls backend inclusion | Separate display visibility, legal eligibility policy, aggregate cap group and date conditions. |
| One Save firing several HTTP requests | Save draft, validate/preview, then publish the whole snapshot atomically. |
| No before/after results | Comparison table of current/proposed legal values and government fixtures; highlight monetary differences. |
| Last-updated fields only | Revision history, sources, publication actor/time/reason and rollback by selecting a prior compatible revision. |

Useful editor sections: identity/sources; profiles and thresholds; ordinary bands; employment; rebate and investment eligibility; individual minimum; supported special incomes; settlement/filing; surcharge/turnover where enabled; preview/history. Unsupported advanced policies should be read-only or unavailable until the engine supports them.

Do not expose arbitrary legal switches that the backend cannot honor. For example, adding a label called "July warrior" does not add profile eligibility, and setting a dividend rate does not remove dividend income from the rebate base.

### 7.2 Suggested API evolution

Keep existing route organization and super-admin authorization. Exact route names can follow project conventions:

```text
GET  /wealth/tax-planner/config?assessment_year=2026-27
POST /wealth/tax-planner/calculate
     -> includes assessment_year and expected_ruleset_revision

GET  /admin/tax-planner/rulesets
POST /admin/tax-planner/rulesets/{year}/drafts
PUT  /admin/tax-planner/rulesets/{id}/draft
POST /admin/tax-planner/rulesets/{id}/validate
POST /admin/tax-planner/rulesets/{id}/preview
POST /admin/tax-planner/rulesets/{id}/publish
GET  /admin/tax-planner/rulesets/{id}/history
```

These are proposals under the existing API prefix, not implemented endpoints. A small application may combine draft validation and preview. The non-negotiable property is that publication writes the entire coherent revision in one transaction, with a shared revision change visible to all workers.

For compatibility, existing scalar/slab endpoints can temporarily edit the same draft. They must not independently modify the published snapshot. Public clients should refetch/recalculate on a revision mismatch rather than mixing a new config panel with an old result.

### 7.3 Admin-manageable initial values

For the verified ordinary AY 2026-27 ruleset, the publish preview should show:

```text
assessment_year:                 2026-27
ordinary income period:          2025-07-01 through 2026-06-30
threshold_general:              400000
threshold_woman_or_senior:       450000
threshold_disability_third_gender: 525000
threshold_qualified_fighter:     550000
disabled_dependent_increment:   50000
senior_age:                     65
taxable bands:                  300000@10%, 400000@15%, 500000@20%,
                                2000000@25%, remainder@30%
employment general exemption:   min(one third, 500000)
rebate factors/cap:             3% of A, 10% of B, 750000
individual minimum:            5000; eligible new taxpayer 1000
DPS aggregate eligible cap:     120000
government securities cap:      500000
qualifying unit/fund group:     new investment; no old 500000 group cap
```

This is a review checklist, **not a payload that can safely be pasted into today's admin panel**. Several required fields and semantics do not yet exist there.

## 8. Existing data and migration plan

### 8.1 What the migration history implies

- [Initial migration][migration-d1] introduced tax-year-scoped configuration.
- [Simplification migration][migration-e2] selected a year to keep, deleted other years' related data, and removed tax-year relationships/table.
- [Settings consolidation][migration-f3] merged profile/rebate/minimum rows into the current settings structure and established global uniqueness.
- [Rebate simplification][migration-g4] changed the earlier rebate model to the current three-limit representation with legacy defaults.

Consequently, current rows do not necessarily contain recoverable historic legal rules. Reintroducing a year table cannot reconstruct data already deleted. Do not invent historical versions or assume the current `2025-2026` label proves the values were legally correct for that year. Restore older data only from a verified backup/export if historical calculation is required.

### 8.2 Migration sequence

1. **Inventory and snapshot.** Export all three current rule tables, row counts, identifiers, update metadata, Alembic revision and a content hash. Record the actual public resolved config from each deployment. This is still outstanding because no live DB was inspected.
2. **Classify current data.** Compare actual values with repository defaults and the new legal baseline. Identify deliberate admin customizations, disabled categories and inconsistent labels. Preserve the entire old snapshot as `legacy_unverified` unless its legal year has been established.
3. **Add forward migrations.** Introduce ruleset identity/FKs, scoped uniqueness and audit metadata. Do not edit previously applied migrations or use downgrade/upgrade as a data-conversion mechanism.
4. **Backfill safely.** Link current slabs/categories to the preserved legacy snapshot. Do not overwrite their values. Any missing/orphaned/duplicate rows must be reported rather than silently repaired into guessed law.
5. **Create a new verified draft.** Insert AY 2026-27 as a separate idempotent ruleset with complete parameters and source references. The operation should use an expected snapshot/revision guard, not update every row matching a loose label.
6. **Deploy compatible engine/read path.** The new ruleset may only publish when the engine can interpret its policy versions. Existing clients get an explicit version transition; they must not silently calculate against partially migrated fields.
7. **Validate and preview.** Run the government fixtures, DB save/cache tests and an actual-data config diff. Compare old/new estimates on representative non-sensitive synthetic profiles.
8. **Publish atomically.** Select the verified revision for its assessment year. Invalidate/refresh all shared pointers and client result caches. Record publication identity and reason.
9. **Observe.** Check config hash/revision and identical calculation outputs across workers, then inspect representative public/admin flows. Log revision and scope errors without logging personal financial payloads unnecessarily.
10. **Rollback if required.** Restore the previous compatible published pointer/engine deployment, preserving both snapshots. Do not erase the new revision or rewrite past results to make the history disappear.

Keep bootstrap and upgrade distinct. The current seed's insert-if-missing behavior means **changing fallback constants or rerunning the seed is not a migration for an existing installation**.

### 8.3 Browser drafts, stored results and old investment data

| Existing data | Treatment |
|---|---|
| `wealth.taxPlanner.v1` drafts | Read via a versioned adapter; preserve entered amounts, add schema version and explicit assessment year, and require confirmation of ambiguous classifications. |
| Broad `freedom_fighter`, `dps_or_savings`, `other_income` fields | Do not auto-certify eligibility or relabel all old values as eligible. Ask for the missing factual classification in the revised flow. |
| Salary amount already net of exemptions | Preserve intent; prevent applying the one-third exemption twice. Distinguish raw employment receipts from precomputed taxable income. |
| Aggregate plus itemized investment values | Detect ambiguity and prevent additive migration without confirmation. |
| Cached calculation responses | Invalidate on schema/ruleset changes. Preserve explicitly saved historical results with their original revision; recalculate only as a separate updated estimate. |
| Historic investments / encashments | Require acquisition, maturity, encashment and prior rebate facts for clawback. Do not apply a new holding rule retroactively by guessing. |
| No server-side saved tax returns in reviewed path | Do not build a speculative mass-rewrite job. First inventory any external/exported result storage in the actual deployment. |

Prefer migration-on-read for browser drafts and a clear review step over deleting all drafts. Do not infer new-taxpayer status from an old draft's creation date.

## 9. Delivery sequence

### Phase 0: Freeze the implementation baseline

Deliver a signed-off rule inventory with P/N/F references, effective-date decisions and supported taxpayer/source scope; export actual configuration and preserve its snapshot. Resolve the targeted interpretation questions in section 11 before enabling their affected policies. Prepare fixtures from the government examples rather than copying current test expectations.

### Phase 1: Correct the ordinary backend and config integrity

Deliver the year/revision contract; correct thresholds/profile eligibility; correct A/B rebate calculation; individual minimum including zero-after-rebate/new-taxpayer cases; category caps and mutually exclusive investment inputs; safe input validation; immutable complete config resolution; atomic publish and multi-worker consistency.

Support the core private-employment/ordinary-income path explicitly. Any currently accepted source whose treatment is unsupported, especially dividends, government salary and complex business/rental income, must either receive its correct policy in this release or return an explicit unsupported/incomplete outcome. Do not keep quietly calculating it as ordinary income.

Release gate: all core fixtures and config-integrity tests pass; no request can obtain a mixed revision; admin-only numerical changes within supported policies require no deployment; no incomplete result is labelled complete tax payable.

### Phase 2: Settlement and existing wider income coverage

Deliver source-tagged credits, filing-date adjustments and exceptions, separate dividend/capital-gain treatment, government employment, supported income deductions, and surcharge/vehicle/turnover support or enforceable scope checks. Add rental/business worksheets only as far as the product intends to collect reliable inputs.

Release gate: N/P settlement examples reconcile; withholding cannot be double-counted; special-rate income is excluded from A correctly; exempt-source and credit restrictions survive the calculation pipeline.

### Phase 3: Admin/public experience and historical planning

Complete the admin editor around the backend draft/preview/publish APIs; add versioned draft migration, revised forms/labels/help, explicit assessment-year selection, timing-aware investment simulation and meaningful before/after tax comparison. Update the V2 design documentation to describe the new contract.

Frontend integration can start once Phase 1 contracts are stable. It must not become a separate calculator with duplicated tax rules.

### Phase 4: Additional scenarios

Only if required by product scope, add full business loss/depreciation schedules, sector-specific turnover treatment, complete late-return computation, foreign-tax/non-resident cases, prior-year rebate recovery and additional exemption categories. Preserve explicit unsupported-case responses until each has source-backed fixtures.

## 10. Verification and acceptance plan

### 10.1 Existing verification performed

Executed from `backend` using its existing virtual environment:

```powershell
& '.venv\Scripts\python.exe' -B -m pytest `
  app/tests/test_wealth_calculations.py `
  app/tests/test_tax_planner_config.py -q -p no:cacheprovider
```

Result: **42 passed, 3 warnings**. No test files were added or changed. The tests need new legal expectations; several current assertions encode the old thresholds/15% rebate and the incorrect post-allowance base.

### 10.2 Government-derived golden fixtures

Every fixture should store the source document/page, year/revision, normalized facts, expected intermediate values, expected result and any scope assumptions.

| Fixture | Source and key inputs | Expected checkpoints |
|---|---|---|
| General high ordinary income | N, printed 50 / PDF 58; general total income 5,000,000 | Gross tax 1,110,000; female equivalent 1,095,000 before rebate. |
| Rebate income cap | N example 18, PDF 62-63; female income 980,000; B = 317,000 | Gross 64,500; A cap 29,400; rebate 29,400; liability 35,100; credits 6,400; payable 28,700. |
| Separate income deduction and investment caps | N example 20, PDF 65-66; total 2,920,000; CZM deduction 70,000 | A = 2,850,000; B = 1,080,000; gross 502,500; rebate 85,500; liability 417,000. |
| New taxpayer despite negative post-rebate arithmetic | N example 22, PDF 67-68; income 430,000, DPS 96,000 | Gross 3,000; entitlement 9,600; applicable floor and liability 1,000. |
| Private salary and excluded group-insurance benefit | N example 23, PDF 68-70; salary 1,260,000, separate benefit 60,000 | Salary exemption 420,000; ordinary income 840,000; capped B = 270,000; gross 51,000; rebate 25,200; liability 25,800. |
| Filing windows on the preceding example | N example 23 | Early payable 24,510; neutral 25,800; Jan-March 28,800; April-June 30,800, subject to the example's eligibility facts. |
| Credits before early incentive | P example 30, PDF 107; gross liability 60,000, WHT 15,000 | Section 173 balance 45,000; incentive 2,250; payable 42,750. |
| Additional tax minimum after credits | P example 31, PDF 108; corresponding balance 45,000 | Jan-March additional tax 3,000; payable 48,000. |
| Hard rebate ceiling | P example 23, PDF 75; A = 50,000,000, B = 10,000,000 | min(1,500,000, 1,000,000, 750,000) = 750,000. |
| Investment factor binds | P example 24, PDF 75-76; A = 20,000,000, B = 4,000,000 | Rebate 400,000. |
| Ordinary plus listed capital gain | N example 12, PDF 52; business 1,500,000; realized eligible gain 6,000,000 | Ordinary tax 170,000; taxable gain 1,000,000 at 15% = 150,000; rebate base excludes special-rate gain; with example investment, rebate 45,000; liability 275,000; less advance 150,000 = 125,000. |

For N example 20, eligible investment includes life premium 60,000, capped DPS 120,000, savings certificates 150,000, zakat 50,000 and mutual-fund investment 700,000. FDR principal and laptop cost do not enter B; the separate CZM deduction is not claimed again. This single fixture catches several category/model errors.

### 10.3 Boundary and behavior tests

- Every threshold exactly, one unit below and above; zero income; overlapping categories; age 64/65; qualified dependents and duplicate-parent claims.
- Every progressive-band boundary and future 35% transition in its own assessment year.
- Individual floor for existing/new taxpayer, all locations, zero/negative post-rebate arithmetic, and a new taxpayer with liability above 1,000.
- DPS and securities caps just below/at/above limits across multiple accounts; mutual-fund new investment above 500,000; ineligible savings/FDR values.
- A excludes exempt/reduced/final/share sources but does not subtract the zero-rate threshold; permitted income deduction changes A correctly.
- Aggregate/itemized requests cannot overlap; unsupported income/profile cannot receive a silently complete estimate.
- Simulation savings stop at the actual floor/tax capacity and obey category caps, dates and closed-income-year rules.
- Negative, non-finite, excessive-precision and contradictory inputs; valid statutory losses only in explicit supported fields.
- Exact filing-window dates, exceptional filers, zero/credit-excess balances, extended dates, and the separate post-assessment-year regime.
- Turnover rate on whole receipts and its threshold boundaries; source restrictions and carry-forward behavior.
- Surcharge triggers at exactly/above wealth and area limits, qualifying vehicle exclusions and electric-vehicle examples.

### 10.4 Admin/database/integration tests

- Reject missing/duplicate/negative/over-100-rate bands, an allowance-only config, early or repeated unbounded bands, incomplete coverage and incompatible policies.
- Publish a complete revision or none; simulate one component failure and ensure there is no partial public state.
- Repeat unchanged slab/category saves against the actual database type to catch delete/insert uniqueness ordering issues.
- Reject duplicate category keys; prove omission semantics and cosmetic-visibility changes do not change legal eligibility.
- Concurrent edits against the same revision produce a conflict rather than lost updates.
- Two backend workers return the same new revision/results immediately after publication according to the chosen consistency contract.
- Missing/malformed config never silently selects an old year or produces a hybrid snapshot.
- Seed/new-ruleset creation is idempotent and preserves custom/legacy data; migration has count/hash reconciliation and a tested rollback.
- Browser draft migration preserves values, flags ambiguous eligibility, and invalidates old result caches; public config and result revisions match.
- Existing super-admin write authorization and ordinary admin/public boundaries remain enforced.

## 11. Targeted decisions before implementation

The main threshold, rebate, floor and cap findings are confirmed. The following are narrower decisions to close when implementing their affected paths:

1. **Effective-date matrix:** Record whether each amendment operates by assessment year, receipt date, acquisition/encashment date or filing date. The dividend and investment-holding amendments explicitly mention 1 July 2026; do not implement that as a single blanket transaction-date filter for every rule.
2. **New taxpayer and filing exceptions:** Encode the exact qualifying registration/return history and the separate exceptions to filing-window additions. Do not reuse one guessed `first_time` flag for both without source confirmation.
3. **Insurance and specialized investment conditions:** Extract exact Schedule 6 wording for the life-policy sum-assured calculation, eligible relationships and approval conditions; secondary summaries alone are insufficient for an executable validator. Universal-pension and other special schemes also need their own source-backed mapping.
4. **Investment transition/clawback:** Determine treatment of investments acquired before the amendment, instruments without a conventional maturity date, and attribution of a prior capped rebate. Do not equate early encashment with all proceeds becoming taxable income.
5. **Settlement ordering:** Confirm the surcharge base, rebate allocation across ordinary/special components, individual/turnover/final-tax interactions and restricted credits using dedicated examples. These are not resolved by merely adding fields to `final_tax`.
6. **Exact product scope:** Decide whether this remains a guided individual planner with supported-source boundaries or expands toward a complete return-preparation engine. The first release can be smaller if unsupported cases are identified honestly.
7. **Actual deployed data:** Export live rules and deployment revisions before proposing concrete row updates. This audit did not establish their current contents.

## 12. Recommended first implementation package

Start with a single coordinated backend/admin-data change containing: the year/revision contract, corrected rebate base and parameters, thresholds and profile qualifications, national/new-taxpayer floor, investment cap/eligibility normalization, strict config validation, and atomic consistent rule publication. Include government-example fixtures and a forward migration that preserves the existing snapshot.

Then add settlement and the supported special-income policies, and connect the admin/public UI to the resulting versioned backend contract. Updating only values in today's admin panel would leave material errors and make future law changes harder to audit.

## References to reviewed project files

The links below identify the owning source at audit time. Line numbers may move during implementation.

- [V2 design][design]
- [Tax planner service][service46], [financial formulas][rebateformula], [request/response schemas][profile]
- [Fallback legal values][fallback], [fallback resolver mapping][fallbackresolver], [seed script][seed]
- [Models][models], [resolver][resolver], [config service][configservice], [repository][repository], [validation][validation]
- [Admin editor][adminsave], [frontend rebate explanation][frontendrebate], [calculation/draft hook][frontendhook], [config hook][frontendconfighook]
- [Initial tax tables][migration-d1], [year simplification][migration-e2], [settings consolidation][migration-f3], [rebate simplification][migration-g4]

[source-p]: <C:/Users/asus/Downloads/BD Tax Law Resources/Income_Tax_Paripatra_2026_27 (bangla)_comp.pdf>
[source-n]: <C:/Users/asus/Downloads/BD Tax Law Resources/Income_Tax_Nirdeshika_2026_27 (bangla)_comp.pdf>
[source-f]: <C:/Users/asus/Downloads/BD Tax Law Resources/Finance Act 2026 Bangla.pdf>
[design]: E:/python-projects/smart-stock/backend/docs/tax_planner_v2.md
[service46]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_planner_service.py:46
[service64]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_planner_service.py:64
[minimum]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_planner_service.py:163
[otherincome]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_planner_service.py:198
[investment]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_planner_service.py:214
[allowance]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_planner_service.py:253
[rebateformula]: E:/python-projects/smart-stock/backend/app/modules/wealth/formulas/financial_formulas.py:182
[profile]: E:/python-projects/smart-stock/backend/app/modules/wealth/wealth_schemas.py:63
[fallback]: E:/python-projects/smart-stock/backend/app/modules/wealth/bangladesh_tax_config.py:52
[fallbackresolver]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_config/tax_config_python_fallback.py:15
[seed]: E:/python-projects/smart-stock/backend/app/scripts/seed_tax_planner_config.py
[models]: E:/python-projects/smart-stock/backend/app/models.py:1345
[resolver]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_config/tax_config_resolver.py:24
[configservice]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_config/tax_config_service.py:111
[repository]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_config/tax_config_repository.py:33
[validation]: E:/python-projects/smart-stock/backend/app/modules/wealth/tax_config/tax_config_validation.py:55
[adminsave]: E:/python-projects/smart-stock/frontend/features/admin/admin-tax-planner-view.tsx:143
[frontendrebate]: E:/python-projects/smart-stock/frontend/features/wealth/lib/tax-planner-rebate-helpers.ts:118
[frontendhook]: E:/python-projects/smart-stock/frontend/features/wealth/hooks/use-tax-planner.ts
[frontendconfighook]: E:/python-projects/smart-stock/frontend/features/wealth/hooks/use-tax-planner-config.ts
[migration-d1]: E:/python-projects/smart-stock/backend/alembic/versions/d1e2f3a4b5c6_add_tax_planner_config_tables.py
[migration-e2]: E:/python-projects/smart-stock/backend/alembic/versions/e2f3a4b5c6d7_simplify_tax_planner_config.py
[migration-f3]: E:/python-projects/smart-stock/backend/alembic/versions/f3a4b5c6d7e8_consolidate_tax_planner_settings.py
[migration-g4]: E:/python-projects/smart-stock/backend/alembic/versions/g4a5b6c7d8e9_simplify_tax_rebate_config.py
