# Weekly Plans Profile Tab Redesign — Design

Date: 2026-08-04
Branch: `codex/weekly-planner-ui-ux`

## Purpose

Redesign the weekly planner's client profile tab as a fast planning snapshot. The dietitian should be able to verify the client's nutritional target, safety information, plan direction, measurements, and durable planning constraints without reading an entire profile or leaving the weekly board.

This is the first of four intentionally separate weekly-planner UI cycles: profile tab, header, meal card, then weekly schedule. Only the profile tab is in scope here.

## Selected direction

The approved concept is **Decision snapshot** (visual Option A). It uses a strict information ladder rather than a uniform list:

1. Client identity and the existing edit-profile action.
2. Daily calorie/protein target and BMI as the two primary metrics.
3. A safety block for allergies and other missing clinical information that can affect planning.
4. Plan direction: goal and activity level.
5. Compact measurement chips: weight, height, and age.
6. Planning constraints: permanent instructions, preferences, disliked foods, and medical notes.

The meal schedule is removed from the profile tab. The weekly board already communicates the meal structure, while the profile tab's limited space is more valuable for facts that can change the plan.

## Information hierarchy

### Client identity

The client's name anchors the panel. A clear edit action links to the existing nutrition-profile route. The tab remains read-only; it does not duplicate the editing form or introduce inline editing.

### Primary metrics

Daily energy target and BMI remain a two-card row because they are the two figures checked most often before generation or review.

- The energy card shows the effective kcal target and protein target.
- If the kcal target is manually overridden, the existing override status remains visible.
- The BMI card shows the computed value and category.
- When a metric cannot be computed, the card states why through the existing missing-data language rather than displaying a dash.

### Safety

Allergy information is the first section after the metrics. Known allergens use the medical badge treatment. Missing allergy information is presented as an attention state with a direct route to complete the profile because it can materially affect the plan.

Ordinary absent information does not create additional warning banners. It uses a quiet “Not recorded” state so the panel does not become a wall of alerts.

### Plan direction and measurements

Goal and activity level are paired in a compact structured block. Weight, height, and age render as concise chips so these facts stay scannable without competing with the primary metrics.

### Planning constraints

Permanent instructions, preferences, disliked foods, and medical notes remain visible in a final section. They do not sit behind a disclosure because the tab's purpose is rapid planning context. Long values wrap naturally and retain readable Arabic and English line heights.

## Layout and interaction

- The component remains server rendered and read-only.
- The desktop presentation stays inside the existing fixed end-side rail.
- Below `xl`, the same content and hierarchy appear inside the existing board sheet. The wider sheet may provide more horizontal breathing room, but it does not reorder or duplicate information.
- The two primary metric cards remain side by side. The remaining sections form a single vertical reading order.
- All spacing, alignment, borders, status colors, and shapes use shared Qiwam components and semantic tokens.
- Logical properties preserve the same component structure in Arabic RTL and English LTR.
- The existing edit-profile route remains the only editing surface.

## States and content ranges

The design must handle:

- A complete nutrition profile with allergens, notes, preferences, dislikes, and permanent instructions.
- A profile whose calorie target or BMI cannot be computed.
- Missing allergy information and other incomplete required fields.
- No recorded preferences, dislikes, permanent instructions, or medical notes.
- Several allergen badges wrapping onto multiple lines.
- Long Arabic or English instructions and medical notes.
- Desktop rail width and the existing responsive sheet.

No clinical value, preference, instruction, or absence state may be invented. Every displayed value remains stored or derived by the existing weekly-plans queries and target calculations.

## Technical boundary

The production change is presentation-only and centered on:

- `src/features/weekly-plans/components/context-panel.tsx`
- `src/i18n/messages/ar.json`
- `src/i18n/messages/en.json`

The implementation may remove table-related imports and markup that become unused. It must not change database schemas, migrations, queries, mutations, nutrition calculations, tenant scoping, the profile editing form, the board tabs, or the other three redesign areas.

Reusable UI comes from `src/components/ui/`. A new shared primitive is justified only if the repository has no existing component or supported variant for the approved design.

## Accessibility and localization

- The profile edit action has an unambiguous accessible name and visible focus treatment.
- Safety is communicated with text and structure, not color alone.
- Essential information is never below the design system's readable type floor.
- Arabic and English use the same content hierarchy and logical layout.
- Numeric values and units preserve their internal LTR ordering inside Arabic text.
- Long content wraps without horizontal scrolling or clipping.

## Verification

Implementation is complete only after:

1. Visual checks of Arabic RTL and English LTR at desktop rail and responsive-sheet sizes.
2. Checks with complete data, missing safety data, absent optional notes, several allergen badges, and long content.
3. Confirmation that the meal schedule no longer appears in the profile tab.
4. Confirmation that editing still navigates to the existing nutrition-profile route.
5. `bun run lint`
6. `bun run typecheck`
7. `bun run test`
8. The Impeccable mechanical design detector over the changed UI targets.

## Explicit anti-goals

- No meal-schedule table in the profile tab.
- No inline profile editing.
- No new client or nutrition data.
- No redesign of the tab bar, header, meal card, weekly schedule, profile form, or client portal.
- No query, database, generation, publishing, or nutrition-arithmetic changes.
