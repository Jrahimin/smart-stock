# Tax Planner: make the annual estimate the front door
Approved implementation scope · local review, 7 November 2026 · public planner only

**Recommendation:** Keep one active calculator and two ways to enter the same facts. Quick should answer “roughly how much annual tax?” Detailed should answer “what counted, and why?” Give the current estimate one home. Use Tax Journey to explain it and the simulator to explore a different future. Do not build a new filing engine. Reaching 80–90% of everyday taxpayers is an ambition; we have neither usage data nor evidence of that coverage.

## What the review established

| Evidence | Finding and consequence |
|---|---|
| Local Chrome, sample AY 2027–28, Bangla and English | BDT 900,000 salary produced BDT 20,000 annual liability and BDT 15,000 **potential additional** saving. A sample note already exists on a fresh example; it sits apart from the numbers. Hero, Snapshot, simulator and Journey repeat them. A reader could mistake potential saving for an amount already deducted. |
| Mobile browser, 390 × 844, light | No horizontal document overflow in the opening view. Wealth navigation, artwork, result preview and four benefits consume the screen; the first salary input is below it. Move inputs up before investing in new artwork. |
| Detailed Profile → Income → Investments | Profile presents nine special-case questions. Income displayed multiple forms, including zero-value entries; Investments exposed a catalogue of annual amount fields. In planner-workspace.tsx the checkmark is literally index < current step; jumping to Investments marks Income done without answering it. |
| Simulator, keyboard and help | ArrowRight moved the sample slider from 0 to 1,000; Home moved it back. Fine-tune offers a date and a basis selector; category comparison depends on itemized actuals. Its heading advertises categories even when only the aggregate basis is available. Opened help, dismissed with Escape, advanced and closed the optional tour. Scenario use can change Journey to “Your scenario tax journey,” away from the actual result the reader came to explain. |
| Dark desktop / reduced-motion Chrome | Dark Quick shows competing pale controls and bright nested outlines; muted copy needs measured contrast. In a separate fresh local Chrome profile with reduced motion **enabled**, the slider rendered and three wealth-tax-twinkle animations were still running. Fix these specific sparks; do not infer every animation fails. |
| Existing QA, not rerun for this audit | The consolidated browser report records mobile Bangla/English at 320 and 390 px, foreign-income review, qualifying expense edits, DPS and out-of-period CZM handling. Current audit sampled keyboard controls and tour, not every tour step, assistive technology, device or legal case. |

**Hypotheses to test:** ordinary visitors understand annual salary better than “gross private salary”; grouping makes Journey easier to explain; category-first selection reduces effort without hiding important coverage. Validate with task observation, not page density alone. Do not rank foreign income, freelance work, donations or Zakat by presumed popularity.

## Scope decisions and field trace

Read the [active calculator decision](tax_planner_active_calculator.md) ahead of older plans and the [browser QA evidence](tax_planner_consolidated_browser_qa.md). Implementation map: frontend/features/wealth/tax-v2/{planner-workspace,planner-form,facts,contracts,api}; backend/app/modules/wealth/tax_planner_v2/{contracts,engine,normalization,rules}. Public requests carry facts and active rule identity; normalization determines amounts and exclusions, engine screening determines coverage. Presentation is not an eligibility decision.

| Item | Decision | Why / consequence of hiding |
|---|---|---|
| Residence and taxpayer type | SIMPLIFY | State “Resident individual” beside the mode; offer “Different situation?” with the existing alternatives. Profile entity/residence feed engine._screen. Non-resident/non-individual cannot silently receive a resident estimate. Retain non-default saved values visibly. |
| Allowances, dependents, minimum-tax circumstances | KEEP | Profile qualifications feed engine._allowance and the minimum-tax decision. Present a compact profile summary with editable qualifying details; show the applied allowance, never hardcode this year's amounts. |
| Nine special cases | REVEAL CONDITIONALLY | Replace nine always-open selectors with a visible ordinary-case assumption and “Check exceptions.” Group vehicle/surcharge, foreign or special income, losses/recovery and turnover. Retain each yes/no/unknown answer. Annual request assumptions are separate from saved facts; explicit exceptions and uncertainty must still trigger existing review behavior. |
| Loss offsets, recovery, special-sector rules | EXCLUDE FROM PUBLIC FLOW **as calculators** | Coverage flags losses_or_setoff, prior_rebate_recovery and turnover_or_special_sector are screening inputs, not optional numeric deductions. Keep a discoverable exception route and show why the tool cannot finish. Do not collect elaborate figures for an unsupported calculation. Preserve supported ordinary-business turnover conditions. |
| Specialist, freelance and foreign income | REVEAL CONDITIONALLY | Keep an “Other income or special situation” chooser with coverage text **before** adding. Foreign/treaty income can withhold liability. Do not infer domestic ordinary treatment from “freelance”; ask which supported source/treatment applies or return review guidance. Keep existing entries editable. |
| Income dates for annual totals | REVEAL CONDITIONALLY | normalization accepts absent earned_on for annual totals but excludes explicitly out-of-period entries. Show the active period and optional “Specific receipt date”; always show existing dates and exclusion reasons. Never erase dates when collapsing. |
| Investments: total, category sums, individual records | SIMPLIFY | Annual category amounts are planning estimates; one confirmed total, category totals and verified contributions are alternative inputs, not additive. Show only selected categories first; offer all eligible choices. Shared DPS/securities caps, insurance/PF conditions and approved recipient/date checks still apply. Use InvestmentLine.entered_amount, eligible_amount, excluded_amount, cap_group and reason_codes where available. Do not fabricate category attribution for a single total. |
| Individual records, donations and Zakat | REVEAL CONDITIONALLY | Keep “Check a contribution” for dates, qualification, limits and approved recipients even in an annual-only year. CZM or other dated claims can be excluded; ordinary Zakat is not automatically eligible. Preserve records across method switches; no double counting. |
| Filing balances, payments and TDS | EXCLUDE FROM PUBLIC FLOW when unavailable | Use supports_settlement, not year text. One sentence: annual tax excludes payment reconciliation. Preserve access to previously entered records. When supported, offer credits/balance separately with completeness checks; unknown credits do not mean zero. |
| Statutory entitlement and target metrics | SIMPLIFY | Keep actual annual liability and usable reduction prominent. Move entitlement, limiting basis, capped amounts and minimum-tax effects into “How this was calculated.” Never equate entitlement, potential saving and actual saving. |

## One implementation phase · four ordered commits, one acceptance decision

**1. Agree on language, result identity and freshness before moving controls.** Quick uses annual totals; Detailed checks supported sources and conditions. Neither promises a filing-ready return. Define the glossary below and one shared presentation of the existing calculation response. Example/own/restored is provenance, current/hypothetical is the basis, and updating is freshness: these are separate dimensions. Put “Example” beside the displayed tax until actual financial facts are personalized. Do not infer provenance from a salary matching the sample. Mode, language, tour and simulator changes must not personalize the base. For older restored data of uncertain origin, say “Restored estimate.”

| Display state | Decision from current code | What visitors see |
|---|---|---|
| Current estimate | Current request, matching active identity, base.annual_status = complete, liability present (including zero), no applicable assumptions | Annual Tax after the rebate already applied. Exclusions remain discoverable. |
| Estimate with assumptions | Same valid number, but base.assumptions or hasPlanningAssumptions(facts) applies | Show the number **and** the assumptions beside it. facts.ts builds an annual-only request using defaults for certain unknowns; never write those defaults into saved facts or generalize them to explicit exceptions. |
| Needs information/review | needs_review; liability is null | Explain returned missing facts or review guidance. Link a resolvable issue to its field; a review requirement may not be resolvable by typing. No zero placeholder. |
| Unsupported situation | unsupported; liability is null | Name the uncovered situation, preserve entries and offer a route back to the source. Stop asking irrelevant detail; never imply that removing genuine income makes the estimate valid. |
| Updating | Pending valid request, no current matching response | Label a retained same-identity result “Previous estimate · updating”; with no previous result show pending. Hide stale scenario deltas. On input error say “Last calculated,” not “updating”; link the actual issue. Suspended, unavailable or changed rules cannot borrow another revision’s figures. |

Evidence: engine.py chooses unsupported before needs_review and returns liability only for complete. contracts.py separates annual_status and settlement_status. planner-workspace.tsx already checks revision ID, hash, policy, schema and dates, cancels obsolete work and strips retained scenarios. Preserve those guards across every surface, not only the status line. **Checkpoint:** compare sample, personalized base, scenario edit, pending and invalid-input states before continuing.

**Layout sketch (reading order, not fixed heights):**

    Tax Planner · active income period          optional Help
    Quick: yearly totals | Detailed: supported sources
    Salary / selected inputs                    scope · edit
    ── Your annual estimate ───────────────────────────────
    Annual Tax · dominant amount                state / example
    After applied rebate · potential additional saving → Explore investment
    Tax Journey    Income ── Tax calculation ── Final result
                   expand returned detail        final liability
    What if?       additional BDT [input] [slider] [shortcuts] [Reset]
                   Current Tax → Proposed Tax · Actual additional saving

On mobile keep this order, with the editable field above the fold; stack comparison values when necessary. The result is the **one primary home** for the number. Journey’s endpoint explains it; no second hero snapshot. Use one small dimensional signature at Journey, not ahead of the inputs.

**2. Simplify input and navigation.** In planner-workspace / planner-form, remove the benefits strip and duplicate mode CTA. Keep auto-calculation; one main action per step. Replace earlier-step ticks (currently just index < current step) with numbered steps and current location. Show “Needs attention” only for identified issues. Use stepForPath/focusField to reveal hidden conditions, navigate, focus and describe the affected field in its own units. For multiple issues show the actual distinct messages; count only when known.

Use the field decisions above: profile summary with “Different situation?” and grouped exceptions; selected income sources and investment categories first, with an accessible chooser. Keep all non-default values, dates, unresolved cases and errors discoverable even when an amount is zero. Do not turn an untouched placeholder into a confirmed source. Distinguish **unsupported calculation** (explain and screen), **supported but uncommon** (disclose when relevant), and **repeated or nonfunctional presentation** (remove). Never remove a value from the request just because its control is collapsed.

In Investments label the selected method “Counts in this estimate.” Show whether it is one eligible total, category amounts or checked records. Inactive entries are retained, not converted or added together. facts.ts serializes one representation; planner-workspace clears an incompatible category-specific hypothetical when leaving itemized mode. Explain that reset. When supports_settlement is false, hide new payment and filing actions, show one annual-only note and an accessible list of existing records. **Checkpoint:** switch modes and all three methods; inspect counted vs entered amounts, errors, and restored facts.

**3. Consolidate results, Journey and simulation.** In planner-results, planner-template, rebate-details and planner-form, give base annual liability priority. Label applied reduction separately from maximum potential additional saving. Link directly to the simulator. Group Journey into Income (receipts, exemptions, taxable amounts), Tax calculation (allowance, slabs, special rates, rebate and minimum-tax check), Final result (annual liability). Use returned amounts and expandable lines/source links, not a client reconstruction. Remove unscaled bars, repeated totals and generic insights. Default to current facts even when a scenario is active; require an explicit labelled choice for any hypothetical Journey.

Keep additional amount, numeric entry, slider, a few in-range shortcuts, Reset and the returned current Tax → proposed Tax → actual additional saving together. Reset only the hypothetical facts; at zero extra show zero selected saving for a resolved comparison, not the maximum saving opportunity. Distinguish zero liability, no further reduction (including a binding floor), and unresolved eligibility. Do not collapse “unknown” into “no saving.” Let slider labels wrap. Prefer inline fine-tuning with the comparison visible; if retaining the dialog show the updated comparison in it and provide “View comparison” with focus restoration. Offer a category selector only where multiple valid bases exist. **Checkpoint:** inspect comparison and Journey together after each edit, Reset and failed scenario.

**4. Refine surfaces and verify the whole journey.** Use scoped planner styles and theme tokens: neutral surfaces, fine highlights, soft shadows, a restrained indigo action, muted teal with a text label for savings. Remove neon glows and lavender washes; emphasize the final liability within Journey. Animate only meaningful value changes briefly. Disable decorative motion including the observed twinkles under reduced motion. Update optional guide copy and tour targets once layout is stable. Run the gates below before accepting this single phase.

**Dependency boundary:** This is frontend presentation and request orchestration. Existing config, calculation, scenario, guidance, line breakdown, exclusion and source contracts suffice. Where category attribution is unavailable show only the aggregate. No necessary backend change identified; adding unsupported legal treatments would be separate policy, evidence, engine and regression work. No rate changes, publication, migration, filing engine or writes to saved user scenarios.

## Shared terminology and representative copy

| Concept | English | Bangla convention |
|---|---|---|
| Product / annual liability | Tax Planner / estimated annual Tax | Keep the product name; use “আনুমানিক বার্ষিক কর” for the amount. |
| Investment / counted amount | Investment / amount counted | “বিনিয়োগ” in sentences; “রেয়াতের হিসাবে ধরা হয়েছে” for counted amounts. |
| Applied rebate / potential saving | Tax reduction already applied / could save more | “রেয়াতে কর কমেছে” / “আরও সাশ্রয় হতে পারে”. Never label both simply “সাশ্রয়”. |
| Scenario | If you invest more | “আরও বিনিয়োগ করলে”; do not call it the visitor’s current tax. |
| Common instruments / withholding | DPS, FDR, TDS | Keep familiar abbreviations; on first use explain TDS as “উৎসে কাটা কর”. Do not imply every FDR qualifies for rebate. |



| Placement | English | বাংলা |
|---|---|---|
| Mode | Quick: use yearly totals. Detailed: check income sources and investment limits. | দ্রুত হিসাব: বছরের মোট অঙ্ক দিন। বিস্তারিত হিসাব: আয়ের উৎস ও বিনিয়োগের সীমা মিলিয়ে দেখুন। |
| Example | Example tax · based on BDT 900,000 salary. Enter your annual salary to update it. | নমুনা কর · বছরে ৯ লাখ টাকা বেতন ধরে। নিজের বার্ষিক বেতন দিলে হিসাব বদলাবে। |
| Scope | For resident individuals. Have foreign income or another special situation? | বাংলাদেশে নিবাসী ব্যক্তি করদাতার জন্য। বিদেশি আয় বা বিশেষ কোনো পরিস্থিতি আছে? |
| Counted amount | DPS: you entered {entered}; {eligible} counted toward the rebate. | আপনার দেওয়া DPS-এর অঙ্ক {entered}। রেয়াতের হিসাবে ধরা হয়েছে {eligible}। |
| Simulation | If I invest {extra} more: estimated tax {current} → {proposed}. Additional saving: {saving}. | আরও {extra} বিনিয়োগ করলে আনুমানিক কর {current} থেকে হবে {proposed}। এই অতিরিক্ত Investment-এ সম্ভাব্য সাশ্রয়: {saving}। |
| Unresolved | Check this income source before we estimate annual Tax. | বার্ষিক করের হিসাব করতে আয়ের এই উৎসটি যাচাই করুন। |

## Acceptance and iteration

Current **heuristic** ratings: usability 6.5/10 (inputs late on mobile, false completion); clarity 6.5 (base vs potential saving); visual polish 7 (consistent identity but too many accents); financial transparency 8 (breakdown, sources and exclusions already present). Not usability-study scores. Target ≥8.5/10 usability and polish **after** these gates:

1. **Entry:** at 390 × 844 see the editable salary field on load; at 320 px no page overflow.
2. **Parity:** replay active-revision Quick 900,000 salary / no investment and equivalent Detailed inputs; base liability and exclusions match the pre-change response. Switch paths, locale, tabs and methods; amounts/dates survive and only the selected representation counts.
3. **Eligibility:** enter above-cap DPS and shared securities amounts; show entered vs counted with engine reasons. Check qualified/unqualified donation, boundary and out-of-period date, and foreign/unknown income. Unsupported should withhold the estimate as before. Test a zero-tax case and a positive-tax case with no additional usable saving.
4. **Compare:** keyboard arrows, numeric entry and shortcuts agree; Reset and Home restore zero delta without altering current facts. Show floor-limited actual saving rather than entitlement. Dialog Escape returns focus. On 320 px, Bangla slider labels and large BDT amounts remain readable.
5. **Freshness:** delay/reorder calculation and simulation responses while typing; stale same-revision values are labelled updating, obsolete replies cannot win, changed revision/invalid config cannot present an old liability as current. Keep entered facts after retry. Use disposable fixtures for settlement-supported years and rule-switch tests.
6. **Presentation:** test desktop/mobile, both languages/themes, 200% zoom, keyboard-only and reduced motion; readable focus, 4.5:1 normal text contrast, no page overflow, no running decorative animations under reduced motion. Walk tour forward/back after layout changes.
7. At **each commit checkpoint**, capture the same opening, exception, result and scenario screens; record the three weakest observations and rate against the gates. Revise and replay failed journeys. Do not approve on screenshots or an average score alone.

Additional release gates: exercise all three investment representations with different amounts, switch back and confirm both preserved inactive values and exclusive counting. Include a zero-amount row with a non-default date or unresolved fact. Jump directly to Investments: Income must not be marked complete. From multiple errors navigate to each affected field, including a collapsed condition. Test a binding minimum tax where statutory entitlement exceeds usable reduction: all surfaces show the engine’s actual saving. Test a failing hypothetical on a valid base: the base survives, the proposed number does not. Check sample identity on mode, locale and scenario changes; retained data must not masquerade as a fresh estimate.

At each checkpoint use disposable hypothetical facts across English/Bangla, light/dark and desktop/mobile. Test → record concrete weaknesses → revise → replay affected journeys; finish with the full matrix, including keyboard and reduced motion. Separate observed passes, failures and untested combinations. Ratings remain provisional until task observations and accessibility checks support them.

Implementation verification is local only. No user scenario is saved and no administrative configuration is edited or published. Human task observation with at least 4 of 5 participants per language remains pending; all heuristic ratings remain provisional. Automated and browser evidence must distinguish observed passes from untested combinations. Invalid or failed hypothetical requests retain a matching valid current estimate across summary, Journey and help, while clearing the proposed amounts and deltas. Bangla copy selectively retains familiar Tax and Investment labels.


Human task observation is a separate pending study and does not block Codex execution closure: in a small moderated English/Bangla check, the target remains at least 4 of 5 first-time participants per language choosing the right mode, personalizing the example and identifying annual tax without help. No participant results are claimed; do not extrapolate population coverage. Heuristic ratings remain provisional.

Public lifecycle safeguards: explicit Not sure answers remain unknown while untouched annual defaults are tracked separately in compatible browser drafts. A current base is compared using its normalized request independently of hypothetical validation; known rule changes or unavailability invalidate it immediately. Summary and details show only assumptions returned or applied to that result. Unsupported settlement facts and deliberately inactive retired categories remain inspectable in the draft but are excluded from active validation and serialization. All known field errors and hypothetical missing facts have separate localized guidance and field links. Mobile result/simulator anchors clear the fixed header.
