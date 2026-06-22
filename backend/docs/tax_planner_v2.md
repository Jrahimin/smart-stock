# Tax Planner V2

Configuration-driven tax calculator for Bangladesh resident individual planning estimates.

## Design

Calculator-first: **3 tables** — one settings row, slab rows, and investment category rows. No fiscal-year history, publish workflow, or singleton side tables.

| Table | Purpose |
|-------|---------|
| `tax_planner_settings` | Display metadata, profile thresholds, rebate, minimum tax amounts |
| `tax_slabs` | Progressive slab bands (unique `sort_order`) |
| `tax_investment_categories` | Label, order, enabled per fixed category key |

### In code (not configurable)

- Profile priority: Freedom Fighter → Disability → Woman/Senior → General
- Location tier codes and minimum-tax resolution order
- Investment `category_key` → API field mappings
- Income aggregation and calculation flow

### Configurable (admin / DB)

- Threshold amounts, slab amounts/rates, rebate %, caps, minimum tax amounts
- Investment category visibility, order, labels
- Display name, disclaimer, tax year label

## Bootstrap

```bash
cd backend
alembic upgrade head
python -m app.scripts.seed_tax_planner_config
```

## APIs

**Public**

- `GET /api/v1/wealth/tax-planner/config`
- `POST /api/v1/wealth/tax-planner/calculate`

**Admin** (`SUPER_ADMIN` write)

- `GET /admin/tax-planner/config`
- `PUT /admin/tax-planner/config` — all scalar tax-law values in one request
- `PUT /admin/tax-planner/slabs`
- `GET/PUT /admin/tax-planner/investment-categories`

## Validation

Writes validate:

- Exactly one allowance slab
- Unique slab `sort_order`
- Unique investment category `sort_order`
- Non-negative amounts for thresholds, rebate, and minimum tax

## Fallback

If settings or slabs are missing, resolver uses `bangladesh_tax_config.py`.

---

## Phase 1 — Config engine (complete)

Public calculator reads tax-law values from the database via `TaxConfigResolver`. Frontend uses `GET /wealth/tax-planner/config` for rebate tips, investment cards, and display metadata.

### Acceptance

1. Seed → config API returns tax year label, rebate rules, investment categories
2. `POST /wealth/tax-planner/calculate` matches pre-refactor numbers for standard scenarios
3. UI loads cards/tips from config API (no hardcoded rebate constants)
4. DB threshold edit → calculate output changes without deploy
5. `is_enabled=false` on a category → hidden in UI and excluded from investment sum
6. `pytest app/tests/test_wealth_calculations.py` passes

---

## Phase 2 — Admin + minimum tax (complete)

### Delivered

| Item | Detail |
|------|--------|
| Minimum tax | Amounts on `tax_planner_settings`; floor after rebate; `profile.location_code` |
| Public UI | Location dropdown on About You step; Tax Journey minimum-tax step when applied |
| Admin API | `/admin/tax-planner/config`, `/slabs`, `/investment-categories` |
| Admin UI | `/admin/tax-planner` — scalar config, slab editor, investment categories |
| Cache | `TaxConfigResolver.invalidate_cache()` on every admin write |

No fiscal-year clone/publish workflow — changes apply immediately (simplified product scope).

### Acceptance

1. `SUPER_ADMIN` edits thresholds, rebate, minimum tax, and slabs in `/admin/tax-planner`
2. Saved changes appear on public config + calculate after cache invalidation
3. Investment categories editable globally (labels, order, enabled)
4. Minimum tax floor applies when configured; location tier overrides national default
5. Validate end-to-end on public Tax Planner after admin save (no preview API)

### Phase 2 test commands

```bash
pytest app/tests/test_wealth_calculations.py app/tests/test_tax_planner_config.py -q
```
