# Reference Tax Journey implementation

Scope: replaced only Journey tiles, the lower summary strip and Smart Insights/Explore action with the supplied three-stage calculation surface, receipt, footer and opportunity band. Hero, inputs, Tax Snapshot, simulator and section position remain intact. No backend, rule, API, publication, deployment or saved-scenario changes.

## Data mapping

- Income: sum of returned entered receipts; excluded amounts and allowed source/income deductions, shown separately when both apply; subtotal is returned ordinary plus special-rate income.
- Tax basis: returned ordinary income and personal allowance; authoritative `ordinary_income_above_allowance`. Special-rate income stays separate rather than being reduced by the personal allowance.
- Receipt: returned gross Tax, rebate applied before minimum Tax (difference of existing backend checkpoints), optional post-rebate Tax, minimum-Tax top-up and liability rounding adjustment; strongest value is returned annual liability.
- Footer: effective usable reduction, effective rate and existing calculation-details/source dialog.
- Opportunity: returned additional eligible Investment and potential additional saving, only offered as a positive opportunity for a current complete estimate. Unknown amounts use dashes; no-saving states do not invent an additional Investment amount.
- Simulator scenario outputs never feed the Journey. The comparison CTA only scrolls/focuses the existing simulator.

## Validation

- TypeScript and diff whitespace checks pass.
- 88 focused presentation/facts API tests pass, including checkpoint reconciliation, special-rate separation, exemptions and deductions, rounding, unknown values, current-versus-scenario isolation, stale/updating opportunity protection and CTA callbacks.
- Codex browser: Bangla/light and English/dark, matching 1606px desktop viewport, 390px mobile stacking, no horizontal page overflow, focus/help, existing details dialog, comparison navigation without applying Investment.
- Browser baseline: salary 900,000; deductions 300,000; allowance 400,000; income above allowance 200,000; annual Tax 20,000; potential additional saving 15,000 for additional eligible Investment 150,000.
- Browser minimum case: eligible Investment 180,000; rebate 18,000; post-rebate Tax 2,000; minimum addition 3,000; annual Tax 5,000; actual usable reduction 15,000; no further saving.
- Browser large amount: income 999,999,999.99; annual Tax 299,442,000 with eligible Investment 180,000. Amounts remained selectable and did not clip on desktop.
- Browser scenario: extra Investment 50,000 gives proposed Tax 15,000 while Journey stays 20,000.
- Entered original facts verified unchanged; temporary QA tabs closed. No scenarios saved.

## Evidence

Thread visualization directory: `C:/Users/asus/.codex/visualizations/2026/11/07/01a1b5c4-14ca-7a63-8271-e2b9c24582a3/`.

- `receipt-journey-before.jpg`: existing Journey before edits.
- `receipt-journey-section-after.jpg`: complete new section, with the potential-saving note visible.
- `receipt-journey-minimum.jpg`: minimum-Tax and no-saving case.
- `receipt-journey-mobile-bn.jpg`, `receipt-journey-mobile-en-dark.jpg`: mobile receipt/footer/band.

Artwork assets and generation prompt family: `frontend/public/wealth/tax-journey/README.md`. All four PNGs inspected together; 1254×1254 RGBA, genuine alpha-capable PNGs. Semantic content and amounts are HTML, never baked into artwork.

## Limits and deviations

Generated artwork matches the material family but is not an exact reproduction. The folded corner and delicate bottom edge use CSS geometry. The app's shell and existing theme/typeface tokens are retained; additional rows expand the receipt for complex calculations.

Physical-device touch, screen-reader software and live reduced-motion emulation were not tested. Reduced-motion CSS and navigation preference handling are implemented. Complex special-rate, stale and unknown results were verified with component fixtures rather than every variant in the browser. The full repository test suite was not run.
