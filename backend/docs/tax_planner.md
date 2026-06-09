# Tax Planner

The Tax Planner is an educational Wealth Workspace tool for estimating ordinary resident individual tax in Bangladesh and exploring how eligible savings or investments may affect the estimate.

It is not a tax filing system, eReturn replacement, document-preparation workflow, legal advisory tool, or government-form experience.

## Product Goal

Help ordinary people answer three questions:

- Approximately how much tax might I need to pay?
- How did the system reach that estimate?
- What legitimate financial decisions could potentially reduce my tax burden?

The experience should feel like a modern financial planning tool. It should avoid government-form language and guide users through a friendly scenario:

```text
Who are you?
  -> How do you earn money?
  -> How do you save or invest?
  -> Review your picture
  -> Estimated tax
  -> Ways you may legally reduce tax
```

Always show this disclaimer subtly:

```text
Estimated for planning purposes only. This tool is not a substitute for professional tax advice or official NBR tax filing.
```

V1 should also mention that minimum tax and special filing situations are not fully modeled.

## V1 Scope

V1 supports ordinary resident individual planning only.

Primary users:

- salaried employees;
- private company employees;
- government employees;
- bank employees.

Secondary users:

- freelancers;
- small business owners;
- consultants;
- mixed-income individuals.

Explicitly out of scope:

- limited companies;
- corporate taxation;
- partnership firms;
- foreign tax credits;
- international taxation;
- transfer pricing;
- wealth statement preparation;
- asset schedules;
- source tax reconciliation;
- agricultural special cases;
- tax audits;
- legal advisory;
- eReturn submission;
- government form generation;
- document uploads;
- capital gain optimization;
- complex property accounting.

If a user falls outside the intended scope, show a friendly note that the estimate may be inaccurate.

## V1 Non-Goals

Do not add backend persistence in V1.

- Do not use `wealth_scenarios`.
- Do not save Tax Planner data to the database.
- Do not integrate with Money Snapshot yet.
- Do not create migrations.
- Do not model full minimum tax rules.
- Do not prepare tax returns.
- Do not generate NBR forms.
- Do not provide legal advice.
- Do not replace professional accountants or tax advisers.

The frontend may use localStorage only to preserve in-progress planner state across refreshes. Future versions may prefill from Money Snapshot or save planner scenarios after the product contract is stable.

## Backend Placement

Recommended files:

- `backend/app/modules/wealth/bangladesh_tax_config.py`
  - FY-specific tax slabs.
  - Special tax-free thresholds.
  - Investment rebate settings.
  - V1 disclaimer and scope notes.
- `backend/app/modules/wealth/tax_planner_service.py`
  - Stateless orchestration for Tax Planner calculations.
  - Parses request values, resolves config, computes tax, and creates structured insights.
- `backend/app/modules/wealth/formulas/financial_formulas.py`
  - Pure reusable math helpers only.
  - Progressive slab calculation.
  - Eligible investment/rebate calculation.
- `backend/app/modules/wealth/wealth_schemas.py`
  - Tax Planner request/response schemas.
- `backend/app/modules/wealth/wealth_router.py`
  - Thin public endpoint wrapper.

Use this endpoint:

```text
POST /api/v1/wealth/tax-planner/calculate
```

Keep the route stateless and public like the other educational Wealth tools. The router should only validate the request, call the service, and return `success_response(...)`.

## Configuration

Tax settings must come from configuration, not inline constants inside service logic.

The FY 2025-2026 resident individual model should include:

- tax-free thresholds by profile category;
- progressive slabs;
- investment rebate cap logic;
- rebate rate;
- max rebate cap, if applicable;
- disclaimer and notes for unsupported situations.

Example config shape:

```python
@dataclass(frozen=True)
class TaxSlab:
    amount: Decimal | None
    rate: Decimal


@dataclass(frozen=True)
class TaxFreeThresholds:
    general: Decimal
    woman_or_senior: Decimal
    person_with_disability: Decimal
    freedom_fighter: Decimal


@dataclass(frozen=True)
class InvestmentRebateConfig:
    max_income_percentage: Decimal
    max_amount: Decimal
    rebate_rate: Decimal


@dataclass(frozen=True)
class BangladeshTaxYearConfig:
    fiscal_year: str
    display_name: str
    thresholds: TaxFreeThresholds
    slabs: tuple[TaxSlab, ...]
    investment_rebate: InvestmentRebateConfig
    disclaimer: str
    minimum_tax_note: str
    enabled: bool = True
```

The service should resolve the enabled fiscal year by request value, falling back to the default enabled FY config.

## Request Model

The request should support two modes:

- `QUICK`
- `DETAILED`

Quick Estimate is the default and should ask only:

- annual salary;
- other yearly income;
- tax saving investments.

Do not ask for gender, age, or special taxpayer categories in Quick Estimate. Use the default general resident individual profile and invite the user to switch to Detailed Estimate afterward for better accuracy.

Detailed Estimate exposes the guided flow.

Suggested request shape:

```json
{
  "mode": "QUICK",
  "fiscal_year": "2025-2026",
  "profile": {
    "resident_individual": true,
    "gender": "MALE",
    "age": 35,
    "senior_citizen": false,
    "person_with_disability": false,
    "freedom_fighter": false
  },
  "income": {
    "annual_salary": 1200000,
    "other_yearly_income": 100000,
    "festival_bonus": 0,
    "other_employment_benefits": 0,
    "self_employment_income": 0,
    "rental_income": 0,
    "bank_interest": 0,
    "fdr_profit": 0,
    "dps_profit": 0,
    "sanchayapatra_profit": 0,
    "dividend_income": 0,
    "other_income": 0
  },
  "investments": {
    "life_insurance": 0,
    "provident_fund": 0,
    "dps_or_savings": 150000,
    "sanchayapatra": 0,
    "stock_market": 0,
    "mutual_funds": 0,
    "approved_donations": 0,
    "other_eligible_investment": 0,
    "simulation_additional_investment": 0
  }
}
```

For Quick Estimate, only `annual_salary`, `other_yearly_income`, and total tax saving investments need to be populated by the frontend. The backend may normalize those into the same internal calculation model as Detailed Estimate.

Backend field names may keep calculation-oriented names such as `current_eligible_investment` in the raw response, but user-facing UI copy should say **Tax Saving Investments**.

## Income Categories

Use friendly labels in the frontend and clear backend keys.

Detailed mode income groups:

- Salary
  - Annual Salary
  - Festival Bonus
  - Other Employment Benefits
- Self Employment Income
  - Small business, freelancing, consulting or professional income.
- Rental Income
- Savings & Deposit Income
  - Bank Interest
  - FDR Profit
  - DPS Profit
  - Sanchayapatra Profit
- Dividend Income
- Other Income

Everything is yearly. Do not ask for monthly amounts.

## Response Model

The backend should return raw calculation values, not presentation metrics or UI-specific percentages.

Required raw fields:

```json
{
  "fiscal_year": "2025-2026",
  "total_income": 1300000,
  "tax_free_allowance": 375000,
  "taxable_income": 925000,
  "gross_tax": 135000,
  "rebate": 22500,
  "final_tax": 112500,
  "current_eligible_investment": 150000,
  "maximum_eligible_investment": 260000,
  "remaining_eligible_investment": 110000,
  "potential_additional_tax_saving": 16500,
  "slab_breakdown": [
    {
      "label": "Next 300,000",
      "taxable_amount": 300000,
      "rate": 10,
      "tax": 30000
    }
  ],
  "insights": [],
  "assumptions_used": {},
  "disclaimer": "Estimated for planning purposes only. This tool is not a substitute for professional tax advice or official NBR tax filing."
}
```

The frontend should derive:

- effective tax rate (`final_tax / total_income`);
- "potential savings unlocked" percentage and the savings-jar fill level (`current_eligible_investment / maximum_eligible_investment`);
- confidence star rating from the selected mode;
- display formatting and progress/visual states;
- simulation comparisons (baseline vs simulated) and labels;
- results hero and tax-journey layout.

Do not calculate UI-only percentages or visual states in the backend.

## Structured Insights

Insights should be deterministic and structured so future AI modules can reuse them.

Suggested insight shape:

```json
{
  "id": "unused-rebate-opportunity",
  "type": "UNUSED_REBATE_OPPORTUNITY",
  "title": "You still have room for tax saving investments",
  "body": "Adding tax saving investments may reduce your estimated tax further.",
  "severity": "POSITIVE",
  "amount": 110000
}
```

Initial insight types:

- `UNUSED_REBATE_OPPORTUNITY`
- `NO_ELIGIBLE_INVESTMENTS`
- `MULTIPLE_INCOME_SOURCES`
- `HIGH_REMAINING_INVESTMENT_CAPACITY`
- `OUT_OF_SCOPE_PROFILE`
- `MINIMUM_TAX_NOT_MODELED`

Keep all suggestion language positive, educational, and non-alarming.

Avoid these terms in user-facing copy:

- Assessee
- Chargeable Income
- Taxpayer Category
- Admissible Investment

Prefer:

- You
- Your yearly income
- Your savings
- Tax Saving Investments
- Estimated tax
- Potential savings

## Frontend Experience

Route:

```text
/wealth/tools/tax-planner
```

Recommended files:

- `frontend/features/wealth/components/tax-planner-workspace.tsx`
- `frontend/features/wealth/hooks/use-tax-planner.ts`
- `frontend/features/wealth/types/tax-planner-types.ts`
- `frontend/lib/api/wealth-api.ts`
- `frontend/features/wealth/catalog/wealth-catalog.ts`
- `frontend/app/wealth/tools/[toolSlug]/page.tsx`
- `frontend/app/globals.css`

The page is built as a **financial decision simulator**, not a calculator/dashboard. The user should immediately wonder "how much money could I legally keep if I make smarter decisions?" rather than "how do I fill out a tax form?". The whole surface is a single vertical narrative.

Page flow:

```text
Hero → Mode Switch → Input Wizard → Tax Snapshot → Play & Explore → Tax Journey → Smart Insights → Disclaimer
```

### Navigation placement

The Tax Planner is a **top-level Wealth workspace item** (`/wealth/tools/tax-planner`) shown beside `Calculators`, not inside the Calculators dropdown. It is registered in `WEALTH_SUB_NAV_ITEMS` (in `wealth-sub-nav.tsx`) and removed from `WEALTH_CALCULATOR_NAV_ITEMS`. The Calculators trigger is not marked active while on the Tax Planner route.

### Hero (compact, value-only)

The hero is intentionally **compact** (~40% of the original height): tight padding, smaller type, a side-by-side jar + savings card layout, and no CTAs. It explains value without gating the workspace:

- `FY 2025-2026` badge, `Tax Planner` title, and the subtitle "Estimate your yearly tax and discover legal ways to reduce it through tax-saving investments."
- Benefit chips: `No tax forms`, `No uploads`, `Plain language`, `Planning focused`.
- A compact glassmorphism **savings jar** (`SavingsJar` with `compact` prop) beside a "Potential Annual Tax Savings" card bound to `potential_additional_tax_saving`.
- Small educational chips ("What usually helps"): `PF`, `Life Insurance`, `Stocks`, `Mutual Funds`, `Sanchayapatra`.

### Mode switch (always visible)

**Quick Estimate is selected by default** on first load. The input workspace and live results appear immediately — there is no experience-selection gate or `started` flag.

A compact segmented switch (`[ Quick Estimate ] [ Detailed Estimate ]`) sits directly under the hero. Users can swap modes at any time without re-presenting large selection cards.

Draft state (`wealth.taxPlanner.v1` in `localStorage`) hydrates after mount in `useEffect` to avoid SSR/client hydration mismatches.

### Input wizard

- **Quick Estimate**: three yearly inputs only — Annual Salary, Other Yearly Income, Tax Saving Investments (with helper text). No profile questions; uses the default general resident profile. Includes a "Switch to detailed for better accuracy" link.
- **Detailed Estimate**: a wizard with a numbered stepper and `Back` / `Next` navigation. Steps:
  1. **About You** — feels personal and guided, not administrative. Gender is a row of selectable pills; age is a single input; the special categories (Senior Citizen, Person with Disability, Freedom Fighter) are selectable toggle cards (icon + label + helper + check), not dropdowns.
  2. Income Sources (selectable cards: Salary, Business/Freelance, Rental, Deposit, Dividend, Other)
  3. Tax Saving Investments (selectable cards: Life Insurance, Provident Fund, Stocks, Mutual Funds, Sanchayapatra, DPS/Savings)
  4. Review & Calculate
  Cards expand only when selected (progressive disclosure). The final step's button reads "Calculate My Estimated Tax" and scrolls to results.

The estimate recalculates live as inputs change, so results stay below the workspace at all times.

### Tax Snapshot (story, not KPIs)

Instead of a KPI grid, results are framed as a short story with three primary statements:

- **You May Pay** — `final_tax`
- **You Could Still Save** — `potential_additional_tax_saving`
- **Maximum Eligible Tax-Saving Investment** — `maximum_eligible_investment`

Supporting metrics are kept secondary and smaller in a single inline strip: effective tax rate (derived as `final_tax / total_income`), total income, and rebate so far. A confidence star rating sits in the header.

### Play & Explore — "What If I Invest More?" (the star)

This is the most engaging section. It runs a **second, separate calculation** with `simulation_additional_investment` set, so the baseline (no simulation) and the simulated result can be compared without overwriting the user's actual inputs:

- Quick action buttons: `+50,000`, `+1,00,000`, `+2,00,000`, and `Max Out` (jumps to `maximum_eligible_investment`).
- An interactive slider for fine control.
- A "tax-saving room used" **progress bar** plus live metrics: **Current Tax** (baseline `final_tax`), **New Estimated Tax** (simulated `final_tax`), **Tax Saved** (difference), **Potential Savings Unlocked %** (`current_eligible_investment / maximum_eligible_investment`).
- The savings jar fills in proportion to the unlocked %, and the reward copy escalates (encouragement → "maxed out") so the interaction feels rewarding and exploratory.
- A `Reset simulation` link returns the simulated amount to zero.

### Tax Journey

An educational, colorful, left-to-right storytelling flow of icon tiles that explains where the final tax comes from:

```text
Total Income → Tax-Free Allowance → Taxable Income → Gross Tax → Investment Rebate → Final Tax
```

The journey reflects the currently explored scenario (including any simulated investment), so the rebate grows and the final tax shrinks as the user plays.

### Smart Insights

Exactly **3** cards, each serving a **distinct purpose** (no repeated messaging), derived on the frontend from the result:

- **Opportunity** — remaining eligible investment (`remaining_eligible_investment`).
- **Impact** — potential tax reduction (`potential_additional_tax_saving`).
- **Action** — suggested tax-saving instruments (PF, life insurance, stocks, mutual funds, Sanchayapatra).

When the user has already used their full room (`remaining_eligible_investment <= 0`), the three cards switch to a "well optimized / keep consistent / plan ahead" set so the section never feels empty or repetitive.

### Estimate Confidence

The frontend derives a simple confidence indicator from the mode and renders it as a star rating in the Tax Snapshot header:

- Quick Estimate: lower confidence (2 of 4 stars, "Good").
- Detailed Estimate: higher confidence (4 of 4 stars, "Strong"), while still preserving the planning-only disclaimer.

Do not calculate confidence in the backend.

### Simulation Behavior

The investment simulation slider and quick buttons should operate on a temporary simulated investment value.

Rules:

- Do not overwrite the user's actual Tax Saving Investments input fields.
- Send the simulated value in the calculation payload only for the preview result.
- Allow the user to reset the simulated amount back to their actual input.
- Quick actions add temporary increments: `+50,000`, `+100,000`, `+200,000`.

### Smart Insights framing

The Smart Insights section renders exactly three purpose-driven cards (Opportunity / Impact / Action) derived on the frontend from raw response values, so each card always says something different and actionable. Keep copy positive and educational.

The backend still returns its richer structured `insights` array (priority order below). These are retained for future reuse — for example an AI assistant or an alternative surface — even though the current UI derives its three cards directly from the raw numbers:

1. `UNUSED_REBATE_OPPORTUNITY`
2. `HIGH_REMAINING_INVESTMENT_CAPACITY`
3. `NO_ELIGIBLE_INVESTMENTS`
4. `MULTIPLE_INCOME_SOURCES`
5. `OUT_OF_SCOPE_PROFILE`
6. `MINIMUM_TAX_NOT_MODELED`

## Local Progress

The frontend may store incomplete planner state in localStorage to survive refreshes.

Guidelines:

- Keep it device-local only.
- Do not sync to backend in V1.
- Do not write to Money Snapshot in V1.
- Keep a version key so future shape changes can invalidate old drafts safely.

Suggested key:

```text
wealth.taxPlanner.v1
```

## Tests

Add focused tests for:

- Quick Estimate request.
- Below-threshold income returns zero final tax.
- Progressive slab boundary behavior.
- Special threshold override behavior.
- Investment rebate cap behavior.
- Remaining eligible investment and potential saving.
- No minimum tax adjustment in V1.
- Structured insights for no investments, mixed income, and unused rebate.
- Out-of-scope profile returns a friendly insight, not an error.

Run from `backend/`:

```bash
python -m pytest app/tests/test_wealth_calculations.py
```

## Future Compatibility

Future versions may integrate with:

- Money Snapshot prefill;
- DPS Calculator;
- FDR Calculator;
- Sanchayapatra Calculator;
- Stock Holdings;
- Wealth Timeline;
- AI Financial Companion.

Example future prompt:

```text
We found you already track:

Stocks: BDT 400,000
DPS: BDT 120,000

Would you like to use these values?
```

Do not build this integration in V1.
