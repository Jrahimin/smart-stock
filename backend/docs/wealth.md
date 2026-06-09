# Wealth Workspace

The Wealth Workspace is an educational money-decision surface inside Smart Stock. It helps users explore scenarios, compare paths, and gradually build a lightweight **Money Snapshot**—not a ledger, tax system, or full wealth-management account.

## Philosophy

- Lead with situations and comparisons, not calculator directories.
- Fewer fields first; inflation and advanced assumptions stay optional.
- Formulas are globally standard; Bangladesh defaults (BDT, FDR/DPS labels, typical rates) live in assumptions only.
- Sanchayapatra is a first-class Bangladesh asset class, separate from FDR/deposits.
- Outputs are scenario analysis, not personalized financial or legal advice.

## How it works

```text
Landing (/wealth)
  → Pick a situation (FDR, DPS, Loan, Zakat, compare…)
  → Tool or comparison page (live calculation)
  → Insights + next steps (compare, save scenario, open snapshot)
  → Money Snapshot (/wealth/snapshot) — add assets, liabilities, monthly savings
  → Dashboard summary (logged-in) — net worth, clarity, passive-income estimate
```

### Anonymous users

- Can use all public tools and comparisons immediately.
- Can save scenarios locally (device storage) and build a **local** Money Snapshot (assets, liabilities, monthly savings).
- Sign in to sync snapshot and scenarios to the backend.

### Logged-in users

- Same public tools, plus protected snapshot/dashboard APIs.
- Money Snapshot persists per user; dashboard refreshes from saved data.
- Saved scenarios stored in `wealth_scenarios` for return visits.

## Available options

### Scenario tools (`POST /api/v1/wealth/tools/{tool_slug}/calculate`)

| Slug | Familiar label | Core inputs | Rate handling |
|------|----------------|-------------|---------------|
| `fdr` | FDR | Deposit, **FDR rate %**, years | User-editable; optional monthly/quarterly/yearly/maturity profit sharing; **source tax 10/15%** on interest |
| `dps` | DPS | Monthly saving, **DPS rate %**, years | User-editable; optional account identifier; **source tax 10/15%** on returns |
| `sanchayapatra` | Sanchayapatra | Certificate type, amount | Optional purchase date, rate override, payout style, certificate identifier, notes |
| `compound-growth` | Invest | Principal, monthly contribution, **expected return %**, years | User-editable; default ~12% (BD) |
| `emi` | Loan / EMI | Loan amount, **loan rate %**, tenure (months) | User-editable |
| `cagr` | CAGR | Start value, end value, years | Derived rate (no rate input) |
| `zakat` | Zakat | Cash, gold, investments, receivables, liabilities | **Fixed 2.5%** on eligible wealth above nisab; not user-editable |
| `tax-planner` | Tax Planner | Quick estimate or detailed yearly income and eligible investments | Bangladesh resident individual planning estimate; stateless V1, not a filing system |
| `retirement` | Retirement goal | Goal, saved, monthly savings, **return %**, years | User-editable return |
| `savings-goal` | Savings goal | Same pattern as retirement | User-editable return |

Inflation is adjustable separately (advanced assumption) for purchasing-power context.

### Comparisons (`POST /api/v1/wealth/comparisons/{comparison_slug}/evaluate`)

| Slug | What it compares |
|------|------------------|
| `dps-vs-fdr` | Monthly DPS discipline vs lump-sum FDR |
| `fdr-vs-stocks` | FDR certainty vs investing |
| `save-vs-spend` | Saving vs spending now |
| `loan-prepayment-vs-investing` | Interest avoided vs investment gain |
| `inflation-impact` | Nominal vs inflation-adjusted value |

### Money Snapshot & dashboard (protected)

| Route | Purpose |
|-------|---------|
| `GET /api/v1/wealth/snapshot` | Read saved snapshot (assets, liabilities, monthly savings) |
| `PATCH /api/v1/wealth/snapshot` | Partial update; replaces asset/liability lists when provided |
| `GET /api/v1/wealth/dashboard` | Net worth, clarity score, asset mix, insights, saved scenarios |
| `POST /api/v1/wealth/scenarios` | Save a tool/comparison result |

### Public context

| Route | Purpose |
|-------|---------|
| `GET /api/v1/wealth/seasonal-context` | Lightweight seasonal card (e.g. Ramadan Zakat) |

## User journey to the wealth dashboard

1. **Arrive** at `/wealth` — choose a situation (e.g. “Lock money in FDR” / **FDR**).
2. **Explore** — enter amount, **interest rate**, and horizon; results update live.
3. **Understand** — read insights (liquidity, inflation, trade-offs).
4. **Continue** — compare another path, save scenario, or open Money Snapshot.
5. **Build picture** — at `/wealth/snapshot`, add cash, FDR, Sanchayapatra, stocks, gold, property, and loans; save.
6. **Sign in** (optional) — sync snapshot to backend.
7. **Dashboard** — landing Money Snapshot section and `/wealth/snapshot` show net worth, clarity, passive-income estimate, and saved scenarios.

**Clarity score** (0–100) reflects how much useful context is saved (asset values, liabilities, rates, maturity dates, goals, scenarios)—not how wealthy someone is.
Optional projection context is stored in asset/liability `metadata` so users can start with only values and add details later.
Optional identifiers such as FDR account number, DPS account number, Sanchayapatra certificate number, or loan account number are stored as context only. They are never required for the first lightweight entry.
`/wealth/calendar` provides a lightweight money calendar for maturity dates, profit payouts, EMIs, and payoff milestones derived from snapshot context.

## Sanchayapatra configuration

Sanchayapatra certificate definitions live in `backend/app/modules/wealth/sanchayapatra_config.py`.
The calculator consumes configuration values for:

- internal key
- display name
- duration
- default profit rate
- compounding/profit style
- payout frequency
- maturity calculation method
- enabled flag

Initial enabled families:

- Family Savings Certificate
- 5-Year Bangladesh Savings Certificate
- Pensioner Savings Certificate
- 3-Month Profit Based Savings Certificate

The calculation service uses these definitions for maturity date, projected profit, next payout timing, and inflation-adjusted value. Future rate or rule updates should change configuration, not the calculation engine.

## Tax Planner

The Tax Planner is a stateless educational planning tool for ordinary resident individuals. V1 avoids saved scenarios, backend persistence, Money Snapshot writes, document uploads, government-form UX, and full minimum-tax modeling.

Detailed implementation guidance, API contract, config placement, insight types, and future integration notes live in `backend/docs/tax_planner.md`.

## Backend module

Location: `backend/app/modules/wealth/`

| File | Role |
|------|------|
| `wealth_router.py` | HTTP routes |
| `wealth_service.py` | Snapshot, dashboard, scenario persistence |
| `wealth_calculation_service.py` | Tool calculations |
| `wealth_comparison_service.py` | Comparison evaluations |
| `wealth_assumptions_service.py` | Country defaults (BD rates, nisab, labels) |
| `wealth_guide_service.py` | Deterministic insights, seasonal context |
| `wealth_snapshot_repository.py` | DB access for snapshot/goals/scenarios |
| `formulas/financial_formulas.py` | Pure financial math |

## Database models (`backend/app/models.py`)

### `money_snapshots`

One row per user: country (`BD`), currency (`BDT`), optional `monthly_savings`, optional `primary_goal`, and flexible `metadata` JSON. Anchor for the user’s financial picture.

### `money_snapshot_assets`

Broad asset lines: category (cash, deposit, Sanchayapatra, stock, gold, …), label, value, liquidity tier. Optional `metadata` holds projection context such as rate, purchase/maturity date, certificate type, payout style, account/certificate identifier, monthly/periodic profit, and notes. Optional `source_scenario_id` links an asset to a saved calculator run. Not a transaction ledger.

### `money_snapshot_liabilities`

Loans and similar obligations: balance, optional rate, EMI, remaining months, and optional account identifier in metadata. Optional link to source scenario (e.g. EMI tool).

### `money_snapshot_history`

Append-only summary snapshots (net worth, totals) when the user updates their picture—used for progress over time, not transaction history.

### `wealth_goals`

Future targets (emergency fund, retirement, etc.): amount, progress, horizon. Model exists; full goal CRUD API may be added later.

### `wealth_scenarios`

Saved tool/comparison inputs and outputs as JSON (`input_json`, `output_json`) with a `scenario_type` (TOOL, COMPARISON, GOAL). Powers “saved scenarios” on the dashboard.

Relationships: `User` → one `MoneySnapshot` → many assets/liabilities/history; `User` → many `wealth_goals` and `wealth_scenarios`.

## Frontend routes

- `/wealth` — workspace landing (situations, comparisons, Money Snapshot preview)
- `/wealth/tools/[toolSlug]` — scenario tool
- `/wealth/compare/[comparisonSlug]` — comparison
- `/wealth/snapshot` — add/edit assets, liabilities, monthly savings

## Migration

From `backend/`:

```bash
alembic upgrade head
```

## Tests

From `backend/`:

```bash
python -m pytest app/tests/test_wealth_calculations.py
```
