---
target: the client record tabs
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-07T13-28-03Z
slug: src-features-clients-components-client-profile-tsx
---
⚠️ DEGRADED: single-context (harness policy forbids spawning sub-agents unless the user asks)

Mode: **Operate** (staff task surface). Target: the five tabs of the client record.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Active tab, completeness meter and status badges are all clear. No loading state between tabs; Info states portal status with no path to change it. |
| 2 | Match System / Real World | 2 | `يظهر لها` on a male client; `kcal` untranslated among سم/كغ/غ; raw ISO date beside a localized one; a link labelled only `التغذية`. |
| 3 | User Control and Freedom | 3 | Real link tabs, breadcrumb, confirm dialogs on both destructive portal actions. |
| 4 | Consistency and Standards | 2 | Three hand-rolled tinted rows; two icon-disc styles; `text-caption` where peers use `text-label`; two `تعديل` buttons to different dialogs; destructive control in the primary slot. |
| 5 | Error Prevention | 3 | `ConfirmSubmitButton` on reissue and revoke; kcal contradiction surfaced. Revoke sits where the primary belongs. |
| 6 | Recognition Rather Than Recall | 3 | Icons and labels on every tab; gap chips deep-link into the field they name. |
| 7 | Flexibility and Efficiency | 2 | Links restore middle-click/Cmd-click. But four separate controls open one dialog, and there is no keyboard path between tabs. |
| 8 | Aesthetic and Minimalist Design | 1 | Info's activity card is four facts, three empty; Portal is one small card in an empty viewport; the same amber callout renders on two tabs; allergens are drawn twice. |
| 9 | Error Recovery | 2 | Credential and revoke failures are bare red paragraphs naming no recovery step. |
| 10 | Help and Documentation | 2 | `11 / 13` never says which 13 until you scroll to the bottom card. No contextual help. |
| **Total** | | **23/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

**LLM assessment.** The record is authored for this product, not borrowed. Nothing here is a generic admin template: the BMI comfort band against the named categories, the meal schedule whose width carries the day's calorie share, the gap chips that deep-link into the field they name, and the intake completeness meter are all decisions only a dietitian tool would make. The visual language is the Qiwam system's own — olive on controls, warm neutrals on data, no green-means-go, link tabs rather than a segmented switch.

What is not specific is the *composition*. Four of the five tabs are the same object: a stack of same-width cards, each one a 16px semibold title over a grid. That is the card scaffold the craft floor warns about, and it is why the record reads as flat despite each individual card being carefully made. The failure is not taste, it is editing: content is duplicated across tabs, so no tab has enough of its own to justify the scaffold.

**Deterministic scan.** `detect.mjs --json` over `src/features/clients/components`, `client-plans-card.tsx`, `stat-tile.tsx`, `callout.tsx`, `tabs.tsx` returned `[]` — zero findings. The mechanical floor is clean; every issue below is compositional, bilingual, or semantic, which is exactly the class the detector cannot see.

**Visual overlays.** Not attempted — no dev server was started for this critique. Evidence is the four supplied screenshots plus source.

## Overall Impression

The code is better than the screen. Every component carries a paragraph explaining what it replaced and why, and most of those arguments are right. But three of them were applied twice — the allergen block, the kcal-mismatch derivation and the missing-fields callout are copy-pasted between the Info and Nutrition tabs, comments included — and the result is that opening a client shows you the same amber warning twice and the same allergy chip twice while three of the four facts on the Info tab's biggest card read "لا يوجد".

The single biggest opportunity: **decide what each tab owns and delete everything it borrows.** Info currently owns nothing — contact details plus summaries of Nutrition, Visits, Plans and Portal. Give it the person and the two cross-tab facts that actually change a decision, and the emptiness resolves itself.

## What's Working

1. **The link-tab conversion.** Replacing `Segmented` with real `<Link>`s restored middle-click, Cmd-click and pre-hydration navigation, and `tabLinkVariants` correctly refuses to repeat the rail's 2.95:1 contrast failure — olive-700 label, olive-500 underline. The reasoning in `tabs.tsx` is exactly right.
2. **`StatGrid` as a hairline lattice.** Six readings sharing one baseline and one type size is the fix the Nutrition tab needed, and the "an absence is not a reading" rule (`—` at body size, not 24px) is a genuinely fine detail.
3. **The BMI comfort band.** A bare 27.7 means nothing; against the drawn healthy range it means "a little over". The 15–40 track is the right choice — the healthy band occupies a readable quarter instead of a sliver — and it reuses the shared component rather than inventing a second one.

## Priority Issues

**[P1] The same information renders on two tabs.** `suggestTargets`, `targets.missing` and `kcalMismatch` are derived independently in `client-profile.tsx:59-82` and `client-nutrition.tsx:61-93`, then rendered as identical amber `Callout`s on both. The allergen badge block at `client-profile.tsx:171-188` is byte-comparable to `client-nutrition.tsx:297-316`, six-line comment included.
*Why it matters:* a dietitian who reads the warning on Info and then opens Nutrition sees it again and learns to skim both. Duplicated derivations also drift — two thresholds, one of which someone will change.
*Fix:* Nutrition owns the clinical record. Info gets one line and a link, or nothing.
*Command:* `/impeccable distill`

**[P2] Values flush to the opposite edge from their labels, in Arabic.** `dir="ltr"` on the blockified `<a>` in `ContactRow` (`client-profile.tsx:298-306`) and `dir="auto"` on the block `<dd>` in `Notes` (`client-nutrition.tsx:529-534`) both re-resolve `start` against the value's own direction. Screenshot 1: `رقم الهاتف` right, `+97056855566` left, while the email row's empty state below it stays right. Screenshot 3: `تعليمات دائمة` right, its value `greger` a full card-width away on the left.
*Why it matters:* it silently breaks the label→value bond on every Latin-script value in an Arabic record, and it only appears in the RTL build. `docs/design-system.md` documents this exact trap under Tables and the components did the opposite.
*Fix:* isolate the value, don't set direction on the container — `<bdi dir="ltr">` inside an element that keeps the page direction.
*Command:* `/impeccable harden`

**[P3] Two buttons labelled `تعديل`, stacked, opening different dialogs.** `client-record-header.tsx:75` opens the client card; `client-nutrition.tsx:160` opens the intake. Screenshot 2 shows them ~180px apart at nearly the same x.
*Why it matters:* identical label, identical treatment, identical position, different destination. The one that opens the clinical record is the consequential one.
*Fix:* name the object — `تعديل السجل الغذائي`.
*Command:* `/impeccable clarify`

**[P4] Copy that is wrong, not just imprecise.** `intake.shared` is `يظهر لها` on a client the header labels `ذكر`. `units.kcal` is Latin `kcal` among `سم` / `كغ` / `غ` / `سنة`, and `client-plans-card.tsx:126` hardcodes `unit="kcal"` outside i18n entirely. `client.dateOfBirth` renders as raw ISO `1973-08-07` beside `format.dateTime`'s `2026/08/06` on the same line. The field-list separator `'، '` is an Arabic comma baked into TSX at `client-profile.tsx:196` and `client-nutrition.tsx:167`, shipping to the English build.
*Command:* `/impeccable clarify`

**[P5] Section titles are not headings.** `CardTitle` renders a `<div>` (`card.tsx:203`). The record has exactly one `h1` and nothing else — the Nutrition tab is six unlabelled regions to a screen reader. The gap chips are hand-rolled buttons at `py-1` ≈ 26px (`client-nutrition.tsx:399`), below the system's stated 40px floor.
*Command:* `/impeccable audit`

## Persona Red Flags

**Alex (power-user dietitian, 40 clients/week):** Opens a client and reads the same amber "missing fields" warning on two consecutive tabs. Four controls on Nutrition open one dialog. No keyboard path between tabs — arrow keys do nothing in the tab strip, so it's Tab through five links every time. The Portal tab costs a full navigation to see six lines.

**Sam (screen reader, keyboard-only):** One heading on the whole record. Every card title is a `<div>`, so heading navigation lands on the client's name and then nothing — six sections on Nutrition are unlabelled. The gap chips are 26px targets. The BMI scale's four labels are visually positioned against bands they don't align with, and the `role="meter"` is hand-rolled in a feature folder.

**Riley (stress tester):** Already visible in the screenshots. Junk values (`hggggggg`, `grregre`) expose the `dir="auto"` alignment bug immediately. Two 10% snacks truncate to `سناك…` because width is driven by `kcalShare`. A client with no visits, no plan and no email gets an Info tab where the largest card is four facts, three of which say "none".

## Minor Observations

- `sections.contact` (`بيانات التواصل`) sits under a tab labelled `بيانات المتابع` — near-identical words one above the other. `portal.title` is byte-identical to `tabs.portal` and to `recentActivity.portalAccess`; the same phrase appears three times on the record.
- `portal.granted` ("يستطيع هذا المتابع الدخول إلى البوابة.") restates the `مُفعّل` badge one line above it.
- `healthSummary.toNutrition` renders as a bare `التغذية ›` link to the tab 40px above it.
- Portal's action row puts `سحب صلاحية الدخول` in the inline-start slot the design system reserves for the primary.
- `Secret`'s label is `text-caption` (12px) where every peer uses `text-label`; the system says 12px is the floor and nothing a reader needs may live there.
- Three hand-rolled tinted value rows with three different fills and paddings: `bg-muted/60 px-3` (ContactRow), `bg-muted px-4` (Secret), `bg-muted px-3` (MealSchedule).
- Two icon-disc treatments on one tab — `bg-secondary`/`text-primary` vs `bg-muted`/`text-muted-foreground` — neither clickable, so the olive one spends the action colour on decoration.
- The client's name and a height reading are both 24px.
- Every gap in the shell is 16px, so breadcrumb, name, tabs and content read as four unrelated strips.
- Dead i18n key: `intake.sections.portal` ("ما تراه المتابِعة") — the card it named was deleted.
- The completeness card has no header, floating above cards that all have one.
- BMI labels are four equal quarters over four unequal bands: `normal` spans 14–40% of the track, its label centres at 37.5%.
- Possible double scroll — `overflow-y-auto` on the inner div plus a clipped tab bar in screenshot 3. Needs browser verification.

## Questions to Consider

- If Info borrowed nothing from the other four tabs, what would be left — and is that a tab or is it the header?
- The Portal tab is six lines. Is portal access a destination, or a row on the Info tab?
- The meal schedule encodes calorie share as width and pays for it in truncated labels. Which of those two facts does a dietitian actually read at a glance?
- What would this record look like if a section could only appear on one tab?
