# Chrome compact-layout refinement

Compared the user-selected live and local Chrome tabs at the same 1280px desktop width on 2026-11-05. This refinement follows the original live page geometry; legal values continue to come from the current rule packs.

| Item | Observed gap | Adjustment |
| --- | --- | --- |
| Taxpayer categories | Local cards stretched to1139px and stacked vertically; live cards278.75px in four columns | Restored the original four-column grid, original Woman/Senior/Disability/Freedom Fighter order; added qualified categories wrap into the next row |
| Profile fields | Long explanatory copy increased page length | Kept necessary residency/type/minimum/dependent controls together; explanations in keyboard/click/hover info popovers |
| Special cases | Dense explanatory paragraphs mixed with many inputs | Three aligned desktop columns, retained explicit unknown answers, help popovers; official sources remain available |
| Investment categories | New arrangement did not match live density | Live full-width tips panel and three-column category grid restored (374.33px cards at1280px); entry method uses a bounded field width |
| Field help | Permanent descriptions stretched controls unevenly | Public-only compact help context. Existing admin field help remains inline. No nested tooltip buttons inside labels |
| Section headings | Detailed headings were smaller than live | Restored1.25rem headings with compact inline information icons |
| Missing-field actions | Tooltip button became the first focusable element | Prefer actual input/select/textarea over nearby information buttons; existing focus regression verifies this behavior |
| Income/review/Quick | Preserve familiar interaction and card structure | Original income grid, three Quick columns and three Edit summary cards retained; latest typed income and filing facts remain supported |
| Responsive layout | Desktop density must not squeeze mobile | Category grids reduce to three/two/one columns; investment grid reduces to two/one, coverage to two/one |

Validation: frontend44files/290tests passed, TypeScript passed. Browser checked actual category ordering/geometry, tooltip behavior and unchanged tax-fact controls. No backend arithmetic, published rule pack or database changes.
