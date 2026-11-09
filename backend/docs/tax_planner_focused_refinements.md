# Focused refinement proposal — restored Tax Planner
Status: focused styling/copy/minimum-tax refinements implemented; structural changes remain proposal-only. The hero, jar artwork, eight-node Tax Journey, navigation, section order and feature access remain the reference.

## What was fixed during mobile verification
Only the Tax Planner mobile tour scroll/clearance was changed. Previously steps advanced while the page stayed at the hero. Each target now scrolls below the fixed header. Temporary bottom clearance lets the help target remain above the tour sheet; dismissal removes it. Skipping restores keyboard focus to the fixed mascot launcher; Finish keeps focus inside permanent help. Other product tours are unchanged.
At 390×844 and320×568: walked all five steps in English/Bangla and light/dark (40 step states), Back/Next/Finish, permanent help handoff. Checked Escape/continue/dismiss, focus wrap, and touch scrolling of longer Bangla text. Controls remain inside the viewport; no horizontal document overflow. On short screens long explanations scroll within the sheet. Portrait emulator testing, not physical-device certification.
85 existing guide-positioning/preferences + planner-presentation/facts tests and TypeScript passed.

## Next refinements: same composition, no structural implementation yet

| Area | Proposed focused change | Boundary |
|---|---|---|
| Hero/colour | Keep the same gradient stops, size, jar and metric placement. Reduce lavender/glow opacity modestly, starting with about10–15% less intensity; compare light/dark screenshots and retain readable text. | Styling only; no new illustration or banner. |
| Contextual guidance | Edit existing tooltip text; keep rules/eligibility fields. Use “আপনার দেওয়া DPS-এর অঙ্ক” for an entered/projected amount and “এই অতিরিক্ত Investment-এ সম্ভাব্য সাশ্রয়” for scenario saving. | Copy only; no legal assumptions changed. |
| Simulator spacing | Keep its existing card, jar, progress section, slider and three metric positions. Reduce internal vertical gaps by4px where repeated, allow end labels to wrap, and give the existing fine-tune modal visible comparison feedback. | No blocks removed or moved to another section. |
| No further saving | Keep the simulator card/artwork visible. Show “No further Tax reduction under these facts” / “এই হিসাবে আর Tax কমবে না”; disable actions with no effect. Explain minimum Tax only when the returned result says it binds. | Collapsing/hiding existing content would require approval first. |
| Fine-tune comparison (approval-required option) | In the existing modal, place a current Tax → proposed Tax → selected additional saving line below the inputs. Keep the rest of the page and modal navigation unchanged. | This is a concrete modal-content addition; not implemented. |

Existing card proposal, preserving its order:

    What If I Invest More?
    [existing jar + current/target]   [existing explanation/progress]
    [existing fine-tune action]
    [existing slider, fully readable labels]
    [Current Tax] [Investment still needed] [Selected additional saving]

No hero resizing, section reordering, navigation changes, artwork replacement, feature hiding, or content removal is proposed for implementation without your approval. No publication or deployment.

## Focused implementation verified
Hero overlay primary mix26→22%, jar glow45→38%, simulator wash12→10%; existing stops, dimensions and artwork retained. Simulator internal gaps reduced2px, no section/content removal. Clear bilingual floor/zero guidance; minimum-tax explanation gated by returned minimum_tax_binding. Existing no-op slider remains disabled. DPS tooltip distinguishes entered/projected amount. Existing fine-tune modal now shows current Tax → proposed Tax + selected saving; invalid proposal shows dashes while current20k remains. Verified local English/Bangla, light/dark, mobile390 and desktop; hero artwork and8Journey nodes preserved, no mobile overflow. Sample20k; minimum-tax5000; zero0; proposed50000 gives15000Tax/5000saving. 59 focused tests and TypeScript passed. No rates, backend, publication or saved-user-data changes.
