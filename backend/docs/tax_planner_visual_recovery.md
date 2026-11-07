# Tax Planner visual recovery
Recovered locally from verified Git baseline 5d86759244ce6ae6c7311ea008d22cec93014e59 (6 November 2026, "updated Income tax UI UX, refined dashboard"). Git history shows this commit introduced the v2 presentation files; its hero contains SavingsJar artwork, the original benefit chips and split savings card, and its Journey contains eight nodes. The oversized redesign was an uncommitted diff above that baseline.
Checkpoint: codex/tax-planner-before-recovery, commit70f6142, includes ALL prior tracked/untracked work, including unrelated admin changes. Recovery branch: codex/tax-planner-visual-recovery. Ignored local artifacts remain untouched.

## Restored
Original hero, jar artwork, cool gradients, typography, Quick card, Detailed profile cards/source catalogue/category tiles, optional adjustments entry, original simulator composition and fine-tune modal, eight-node Journey, Insights, original help/tour copy, original section order (hero → mode/forms → snapshot → simulator → Journey → help). Global styles/artwork/assets and backend untouched.

## Retained correctness
Current API and facts/validation modules retained: rule suspension/revision refresh protection, cancellation/stale response guards, normalized base identity, retained successful current results for hypothetical failures, independent Investment representations, draft compatibility/storage ownership, explicit uncertainty metadata and all-known-field validation.
Original profile fields now record explicit answer intent. Exact decimal display aggregation retained. Journey uses base/current breakdown even while a hypothetical is active. Current results/help retain accurate engine guidance. Progress uses numbers rather than falsely claiming preceding steps completed.
Earlier presentation restored where intertwined, rather than substituting a new layout.

## Needs selective reapplication
The restored simulator brings back the original interaction: its fine-tune modal, original slider layout and extensive rebate presentation. Exact range-value precision is retained. The newer standalone numeric-entry interaction, compact no-further-saving treatment, newer method/inactive-category management UI and full guide target revalidation need a separate focused pass within this original composition. Stored data/metadata are preserved; no saved user scenarios were modified. Do not claim the abandoned redesign's entire114-test UI acceptance still applies.

## Verification
Chrome local127.0.0.1:3100 verified hero/artwork, eight Journey nodes, Quick/Detailed, English/Bangla and light/dark. Sample salary900000 gives annual20000/potential15000. Slider1000 gives additional saving100 while current Journey remains20000. Returned slider to0. Visual comparison to baseline source and pre-redesign screenshot confirms original composition. 57 focused presentation/facts/API-contract tests passed; TypeScript passed. Full redesigned UI suite and fresh mobile/tour matrix were not rerun for recovery.
Screenshot: E:/python-projects/smart-stock/.local/tax-recovery-restored.png

## Focused proposals only; not implemented
Preserve this composition:
Hero + artwork
Mode / Quick or Detailed cards
Optional adjustments / Snapshot
Existing Investment simulator
Eight-step Tax Journey / Insights / Help

1. Soften existing gradient opacity and glow intensity using the same colours and stops; keep artwork, hero size and placement.
2. Improve existing tooltips and bilingual labels, explicitly distinguishing assumptions and current vs proposed amounts. Keep all eligibility fields accessible.
3. Compact the existing simulator internally: smaller gaps, readable slider end labels, precise amount entry, and visible comparison feedback in the existing fine-tune surface. Keep the card position/artwork.
4. For verified zero/floor-limited saving, show clear copy and disable no-op actions. Propose any actual content collapsing/removal visually for approval first.
5. Small spacing, focus, contrast and number wrapping fixes within existing surfaces.

Any substantial change to section order, layout, navigation, artwork, feature visibility or content removal requires user approval of a concrete visual proposal BEFORE implementation. No publishing/deployment is authorized.
