# Qiwam design system / نظام تصميم قوام

This file is the concise, authoritative UI contract for Qiwam. It describes the
design system that is implemented now: a bilingual, RTL-first application built
primarily from reusable shadcn components adapted to Qiwam's visual language.

Use the following sources in this order when they disagree:

1. Reusable component behavior and variants in [`src/components/ui/`](../src/components/ui/).
2. Semantic tokens and global utilities in [`src/app/globals.css`](../src/app/globals.css).
3. The rules in this file.
4. Existing feature screens and prototypes.
5. [`design-guide.html`](design-guide.html) and images in
   [`design-images/`](design-images/) as detailed visual references only.

The HTML guide and reference images include historical states. They can clarify
the intended character of the product, but they never override current shared
components, tokens, accessibility behavior, or this contract.

## Required UI workflow

Before creating or changing UI:

1. Inspect `src/components/ui/` for an existing primitive or composed pattern.
2. Inspect at least one current screen that solves a similar problem.
3. Compose the existing component before adding classes or creating a wrapper.
4. If the shared component needs another repeatable treatment, add a documented
   variant to it instead of copying its classes into a feature.
5. Create a feature-local component only when it represents feature behavior,
   not a generic button, field, card, dialog, menu, table, or tab pattern.
6. Verify Arabic and English at mobile and desktop widths.
7. Check keyboard behavior, focus, contrast, loading, empty, error, disabled,
   and long-content states.

Do not copy markup from shadcn examples into feature folders when the repository
already contains the component. Import from `@/components/ui/*`.

## shadcn is the component foundation

[`components.json`](../components.json) configures shadcn with the `base-nova`
style, Base UI primitives, React Server Components, Tailwind CSS variables, and
RTL support. Qiwam depends heavily on that component model:

- shadcn/Base UI supplies tested primitive behavior and composition patterns;
- `src/components/ui/` owns the repository's installed and adapted versions;
- semantic tokens give those components Qiwam's appearance;
- feature code composes them into product workflows.

An upstream shadcn component is a starting point, not permission to bypass the
local system. When adding or updating one, review the generated diff carefully:
preserve Qiwam tokens, sizes, focus behavior, RTL logic, popup behavior, and
existing variants. Never overwrite a customized shared component blindly.

Feature code should not import `@base-ui/react` or another primitive library
directly for ordinary UI. Existing direct imports are implementation exceptions,
not examples to copy. If the same primitive treatment appears twice, promote it
to `src/components/ui/`.

### Current reusable inventory

Check the directory itself for the exact API. The current shared inventory is:

| Need | Reuse |
|---|---|
| Actions and status | `Button`, `Badge`, `StatusDot`, `CopyButton`, `ConfirmDialog`, `ConfirmSubmitButton` |
| Form structure | `Field`, `FieldError`, `FieldHint`, `Label`, `Input`, `Textarea`, `InputGroup` |
| Choice controls | `Select`, `SelectField`, `Combobox`, `Checkbox`, `RadioGroup`, `Switch`, `Segmented` |
| Date, time, and phone | `DatePicker`, `DateChooser`, `DateCalendar`, `Calendar`, `TimeInput`, `PhoneField` |
| Surfaces and overlays | `Card`, `Dialog`, `Sheet`, `Popover`, `DropdownMenu`, `Tooltip`, `TooltipHint`, `Toaster`/`toast` |
| Navigation | `Sidebar`, `Tabs`, `PanelTabs`, `Pagination` |
| Data display | `Table`, `Chart`, `ChartTip`, `StatGrid`, `StatTile`, `Progress`, `ComfortBand`, `Timeline` |
| Feedback | `Callout`, `EmptyState`, `Skeleton`, `Spinner` |
| Identity and graphics | `Avatar`, `Icon`, `Caret` |

Some files export several parts. Compose those parts rather than rebuilding the
same anatomy. For example, use `CardHeader`, `CardContent`, and `CardFooter`;
use the `Select` parts for a rich list and `SelectField` for a flat option list.

## Design principles

- Clinical clarity comes before decoration.
- The dietitian remains in control of generated, reviewed, and published data.
- Olive identifies brand and action; it is not a universal data color.
- Lime is a scarce accent fill, not readable foreground ink.
- Medical risk uses clay. Attention uses amber. Missing or incomplete data is
  not automatically an error.
- One component structure serves Arabic RTL and English LTR.
- Geometry stays stable on hover and focus.
- A screen has one clear primary action; peers use quieter treatments.
- Repeated facts are text. Pills are reserved for meaningful states.
- Cards group content; they are not the default container for every block.

## Tokens and styling

### Source of truth

[`src/app/globals.css`](../src/app/globals.css) contains four relevant layers:

1. Raw primitives such as `--olive-*`, `--lime-*`, `--n-*`, `--c-*`, and
   `--clay-*`.
2. `@theme inline`, which registers semantic Tailwind utilities.
3. Light, dark, portal, sidebar, and planner semantic assignments.
4. Shared component utilities such as `.q-field` and `.planner-theme`.

Components consume semantic utilities such as `bg-primary`, `text-foreground`,
`border-border`, `bg-muted`, and `text-status-medical-fg`. Do not use a palette
primitive or raw color at a component call site when a semantic token exists.

Raw hex and `oklch()` values in `.tsx` or `.jsx` are prohibited. The lint rule
`eslint-rules/no-raw-hex.mjs` enforces this. Legitimate per-record colors stay in
data or typed style helpers, not in reusable component classes.

### Color roles

| Role | Current family | Use |
|---|---|---|
| Primary | olive | Primary actions, links, active states, actionable emphasis |
| Accent | lime | Scarce fills, focus ring, completion emphasis, chart range edge |
| Warm neutrals | `--n-*` | Text, borders, cards, shadows, most chart marks |
| Cool neutrals | `--c-*` | Muted surfaces, hover fills, sidebar, planner grid |
| Attention | amber | Follow-up, caution, incomplete information that needs action |
| Medical/destructive | clay | Allergies, contraindications, destructive actions |
| Completed-day accent | flame | Portal completion marks only; one warm accent per screen |

Rules:

- Lime is a fill, never text or an icon on a light background. Use
  `text-on-accent` on `bg-accent-lime`.
- Do not introduce blue for links, focus, or informational notices.
- Do not use clay as a generic “bad” color.
- Do not mix warm and cool neutral surfaces arbitrarily. Use the semantic token
  selected for the surface.
- `--primary` currently maps to olive-500 in light mode and
  `--primary-hover` to olive-600.
- White text on olive-500 is a known 3.47:1 contrast exception. Do not extend
  that pairing to body copy or new non-control surfaces. Prefer a passing token
  combination when creating new patterns.

### Status language

| Meaning | Shared treatment |
|---|---|
| On track | `Badge variant="onTrack"` or `StatusDot status="onTrack"` |
| Needs follow-up | `attention` |
| Missing/incomplete | `incomplete` |
| Not recorded and owed | `unrecorded` badge |
| Medical flag | `medical` |
| Rest | `rest` |
| Completed portal day | `status-complete-*` graphic tokens, not a generic badge |

A badge marks a state, not a value. Names, goals, counts, categories, and
measurements should normally remain plain text. Keep filled badges scarce—one or
two on a typical screen—so status remains legible.

### Arbitrary entity colors

Practitioner colors from [`src/lib/avatar-color.ts`](../src/lib/avatar-color.ts)
are per-record data and may be passed through an inline style. Patient colors
are derived through `patientToneStyle` in
[`src/features/booking/patient-color.ts`](../src/features/booking/patient-color.ts)
and consumed through the `.patient-tone` variables. Do not color a patient from
the legacy stored `clients.color` value.

The WhatsApp QR code may remain pinned to true white for scanner contrast.
These exceptions do not permit hardcoded brand colors in components.

## Typography

Fonts are loaded in
[`src/app/[locale]/layout.tsx`](../src/app/[locale]/layout.tsx):

| Context | Family |
|---|---|
| Arabic UI and headings | Almarai |
| English headings | Readex Pro |
| English body/UI and Arabic fallback | IBM Plex Sans / IBM Plex Sans Arabic |
| Numeric IDs and code | IBM Plex Mono |
| Weekly planner board | Tajawal through `.planner-theme` |

The script-facing variables `--script-ui-font` and `--script-display-font` must
remain in the generated Tailwind font utilities. Arabic overrides are unlayered
because they must outrank `:root`. Font variables belong on `<html>`, and the
locale-specific Almarai and planner Tajawal loaders keep `preload: false` to
avoid downloading them on unrelated pages.

### Type scale

| Token | Size | Weight | Primary use |
|---|---:|---:|---|
| `text-display-lg` | 40px | 500 | Covers and onboarding |
| `text-display-sm` | 32px | 500 | Screen titles |
| `text-heading-lg` | 24px | 600 | Section headings |
| `text-heading-sm` | 20px | 600 | Card and dialog titles |
| `text-body-lg` | 18px | 400 | Notes and long reading |
| `text-body-md` | 16px | 400 | Default body and mobile copy |
| `text-body-sm` | 14px | 400 | Dense tables and secondary UI |
| `text-label` | 13px | 600 | Labels and compact state text |
| `text-caption` | 12px | 400 | Timestamps and helper text only |

Arabic resolves to looser line heights than English. Use the scale instead of
arbitrary font sizes. `text-caption` is the floor and must not carry essential
information. Do not add tracking or uppercase transformations to Arabic text.

When adding a type token, update both `globals.css` and the custom
`tailwind-merge` configuration in [`src/lib/utils.ts`](../src/lib/utils.ts).

## Iconography

Use the Lucide icon set through [`Icon`](../src/components/ui/icon.tsx) and the
role-based registry in [`src/lib/icons.ts`](../src/lib/icons.ts):

```tsx
<Icon name="search" className="size-5" />
```

Add icons to `APP_ICONS` in `src/lib/icons.ts`. Use role-based names such as
`myPlan`, inherit color with `currentColor`, and mirror only direction-bearing
glyphs. The allowlist in `icon.tsx` owns RTL mirroring. Do not import Lucide
directly in feature UI or introduce a second icon style.

**Two names may share a glyph; two rows of one screen may not.** Sharing is fine
across the app — `dish` and `mealDinner` are both `Utensils` and never meet. It
stops being fine when the duplicates land in the same list, where the glyph is
what the reader is scanning by: `privacy` and `security` were both `ShieldCheck`
six rows apart in the portal's settings. Give one of them its own name and its
own picture rather than re-pointing a shared one — `refresh` and `close` are
drawn by the whole app, so the portal's request rows got `rescheduleRequest` and
`cancelRequest` instead.

## Shape, spacing, elevation, and motion

- Buttons and fields use the 10px control radius.
- Cards use the 16px large radius.
- Badges and icon buttons are circular/pill shapes.
- The full-height sidebar is square because it is shell structure, not a card.
- Every free surface rounds all four corners equally. A surface attached to a
  viewport edge, such as a mobile bottom sheet, may round only exposed corners.
- Interactive geometry does not grow or reshape on hover. Use color, ring,
  shadow, or a subtle press sink without layout shift.
- Use Tailwind's 4px spacing scale. Default card spacing is 16px on mobile and
  20px from `sm` upward.
- Use `shadow-card`, `shadow-elevated`, and `shadow-overlay`; shadows are
  olive-tinted. Scrims use `--overlay`, not black. Over a photograph use
  `--overlay-strong`, which is the same olive one step heavier — a dialog scrim
  only pushes the page back, while an image carrying UI has to give up enough of
  its own contrast to read as a background.
- Use the shared motion tokens: `--ease-sweep`, `--duration-arc`,
  `--duration-sweep`, `--duration-label`, `--duration-reverse`, and
  `--duration-travel`.
- `--duration-travel` is reserved for an entire surface crossing the screen.
- Reduced-motion preferences must leave state changes intact while removing
  unnecessary travel.

Avoid card-inside-card styling. A nested item uses `Card variant="tile"`,
`listRow`, spacing, or a plain group instead of adding another ring and shadow.

## Layout and responsive behavior

- Staff pages live beside a navigation rail. Capped content aligns to the
  inline-start with `me-auto`; do not center it away from the rail.
- Auth and onboarding surfaces may center because they do not have the rail.
- Independent unequal columns should be independent stacks, not grid rows that
  inherit the tallest neighbor's height.
- Dense desktop controls must still collapse, wrap, scroll, or move into a
  sheet on mobile without clipping actions or content.
- Horizontal tab sets scroll on narrow screens instead of wrapping into two
  ambiguous rows.
- A scroll container that clips card rings or shadows needs a small inner
  gutter.
- Scrollbars are globally hidden while scrolling remains available through
  touch, wheel, trackpad, keyboard, and drag. Overflowing surfaces must provide
  another visible cue that more content exists.

## RTL and bilingual behavior

Arabic and English use the same component tree. Use logical direction
properties:

- `ms-*`, `me-*`, `ps-*`, `pe-*`;
- `start-*`, `end-*`;
- `border-s-*`, `border-e-*`;
- `rounded-s-*`, `rounded-e-*`;
- `text-start`, `text-end`.

Do not use physical left/right utilities for layout. The lint rule
`eslint-rules/logical-properties.mjs` enforces this. Gradients have no logical
direction keyword, so use logical insets or a reviewed `:dir()` rule when the
visual direction must mirror.

Phone numbers, times, IDs, units, and other LTR values must retain their internal
order. Use `<span dir="ltr">` for an isolated value. Use a table's `numeric`
prop only when the whole column should also align according to an LTR cell.

**The auth screen no longer locks its direction.** It did: the split and its
language control pinned their outer geometry to LTR so that changing language
did not move the furniture. That lock has been removed on request, and the
screen is now built from logical properties like every other one — the form sits
at the inline-start and the illustration at the inline-end, so English puts the
picture on the right and Arabic puts it on the left. The language control
mirrors with the rest, which is the acknowledged cost: the control you just used
is not where you left it.

There is now no direction lock anywhere in the application. Do not introduce one
to repair an RTL layout bug — the bug is a physical property that should be
logical.

## Shared component contracts

### Buttons

Use [`Button`](../src/components/ui/button.tsx) and its existing variants:

| Variant | Use |
|---|---|
| `default` | The action that closes or commits a decision |
| `soft` | A quiet primary action on a reading-first screen |
| `outline` | Secondary brand action |
| `ghost` | Tertiary brand action |
| `neutral` | Boxed peer action that should not compete with the primary |
| `neutralGhost` | Repeated row action with no brand-color noise |
| `accent` | Rare lime completion action |
| `destructive` | Destructive decision, usually inside confirmation |
| `destructiveGhost` | Destructive action among other controls |
| `secondary` | Dense brand-tinted action |
| `primarySubtle` | Affirmative action resting quietly on a content card |
| `link` | Inline textual action |

`default` and `icon` targets are 48px. `sm` and `icon-sm` are 40px and reserved
for dense pointer-oriented contexts such as toolbars and table rows. Do not add
a size below 40px. Labels remain on one line and are capped at 320px.

Keep one clear primary action in a group. Render an action disabled when its
future availability matters and removing it would shift the toolbar. Put its
explanation on a wrapper because disabled buttons do not receive pointer events.

Use `ConfirmDialog` or `ConfirmSubmitButton`, never `window.confirm()`. Do not
confirm easily reversible actions such as archive/restore unless the product
risk specifically requires it.

### Fields and forms

`Input`, `Textarea`, and `SelectTrigger` share `.q-field`. Wrap labeled controls
in `Field` so focus and error behavior remain consistent.

- Controls are normally 48px tall and use 20px inline padding.
- Resting fields are neutral and have no hover fill.
- Focus uses the olive edge without changing box dimensions.
- Read-only and disabled states use muted surfaces.
- Validate on blur or submit, not while a partially entered value is still being
  typed.
- Error messages use `FieldError`; helper copy uses `FieldHint`.
- Use `SelectField` for a simple flat list. Compose `Select` parts when options
  need groups, descriptions, icons, or separators.
- Use `Combobox` when the list needs search/filter behavior.
- Use `TimeInput` for time values; its `step` is seconds and must match server
  validation.
- Use the existing date primitives; date picker, calendar, checkbox, radio,
  switch, and toast are implemented and must not be recreated.

Popup components opened inside a native `Dialog` must portal through
`useDialogContainer()` and use the available-height positioning contract.
`Select`, `Popover`, and `Combobox` already handle this. Preserve that behavior
when adapting another popup.

### Switches and segmented controls

`Switch` is a 48px button target containing the visual track. It is designed for
server-held settings and may act as the submit button of its own form.

The track is shadcn/ui's: 44×24, a plain 20px disc, `bg-primary` on and
`bg-input/60` off, with upstream's 2px transparent border insetting the disc
rather than edging the track. There is no `knob` prop and no leaf — the 52×30
track whose knob carried the Arc sweep and rotated −45° as it landed is gone,
and with it the choice between a leaf and a disc. One drawing, everywhere.

Two departures from upstream, both about this app rather than about taste. The
off fill is `bg-input/60`, not a flat `bg-input`: `--input` is `n-500` here and
is a *border* color picked to read as a 1px line, so poured into a 44×24 slab it
made the off state heavier than the on state. And the disc travels on
`inset-inline-start` rather than upstream's `translate-x`, which is a physical
direction and would slide the wrong way in Arabic.

⚠ **This is why the switch is a hand-drawn `<button>` and not shadcn's own
component.** Upstream's is a Radix root driven by `onCheckedChange` — controlled
state that submits nothing. Adopting it wholesale would trade a settings screen
that works without JavaScript for an appearance. The appearance is what was
wanted, so the appearance is what was taken; the element, the ARIA, the form
semantics and the RTL travel all stayed. Anyone tempted to "just install the real
one" should read this paragraph first.

The padded 48px target is what keeps the control above the touch floor now that
the track is 6px shorter than it was. Its accessible name comes from
`aria-labelledby` pointing at the row's own label, because a `<label for>` cannot
wrap a `role="switch"` button.

`Segmented` is the controlled client component for two to four mutually
exclusive views or modes. Give it accurate semantics with `role="tablist"` or
`role="radiogroup"`. `SegmentedGroup` and `SegmentedOption` are the
server-submitting alternative for settings that must work without JavaScript.

Do not use segmented controls for navigation to different URLs.

### Cards

Use `Card` anatomy: `CardHeader`, `CardTitle`, optional `CardDescription` and
`CardAction`, `CardContent`, optional `CardDivider`, and `CardFooter`.

Current variants are `default`, `tinted`, `empty`, `listRow`, `tile`, and
`archived`. Use `interactive` only when the whole card acts as a target;
`selected` marks persistent selection; `flagged` marks a medical fact without
turning the whole surface red. Use `CardSkeleton` for loading with stable
geometry.

`CardTitle` is not automatically a heading. Pass the appropriate `as` value
when the card is a real section in the page outline.

### Tables

Compose `TableRoot`, `Table`, `TableHeader`, `TableRow`, `TableHead`,
`TableCell`, and `TableEmpty`.

- Header cells form the rounded muted header strip.
- Row borders and hover fills are applied to cells because the table uses the
  separated border model.
- `zebra` stripes rows without overriding hover.
- `linked` rows use a real stretched `Link`, not a row `onClick`.
- Controls inside a linked row sit above the stretched link.
- Sortable headers combine `sorted`/`aria-sort` with `TableSortLabel` and keep
  sort state in the URL where practical.
- Isolate LTR values without changing the whole column unless numeric alignment
  is desired.

### Navigation and view switching

- `Sidebar` is the shared staff/portal rail foundation. The staff shell is a
  near-white, full-height rail with a load-bearing divider—not a floating card.
- `Tabs` is route navigation made from real links. It supports `line` and
  `contained` appearances through matching `Tabs` and `tabLinkVariants` props.
- `TabBadge` is a bare count, not a filled status pill.
- `PanelTabs` switches panels within the current page.
- `Segmented` switches a compact mode or view with few visible options.
- `Pagination` owns list paging controls.

Keep the distinction semantic: an address uses links, a panel uses tabs, and a
temporary display preference uses a segmented control.

### Dialogs, sheets, menus, tooltips, and toast

- Use `Dialog` for focused modal tasks and `Sheet` for secondary mobile/edge
  surfaces.
- A dialog must have an accessible label and a deliberate dismissal policy.
- Use `DropdownMenu` for action menus and profile menus.
- Tooltips supplement an accessible name; they never replace `aria-label`.
- Use the shared `toast`/`Toaster` API for transient confirmation that warrants
  a global message. Prefer inline status when the result belongs to a visible
  section.
- Avoid nested interactive triggers such as a tooltip trigger wrapping a menu
  trigger when the primitive composition does not support both.

### Empty, loading, and status feedback

- `EmptyState` explains what is missing and offers at most one clear next action.
- `Skeleton` preserves expected layout during content loading.
- `Spinner` is for bounded action progress, not an otherwise empty page.
- `Callout tone="neutral"` communicates notable information,
  `attention` requests follow-up, and `medical` communicates clinical risk.
- There is no generic success callout. Confirm close-to-source when possible.

### Avatars

`Avatar` represents a person and remains circular. Current sizes include `xs`,
`sm`, `default`, `lg`, `planner`, and `xl`. The name is rendered beside it, so
the graphic is decorative. Use the same entity color everywhere that person
appears.

## Charts and figures

Use semantic `viz-*` utilities and the shared chart parts. Do not hardcode chart
colors in feature components.

| Scale | Purpose |
|---|---|
| `viz-seq-1`…`5` | Ordered magnitude |
| `viz-cat-1`, `viz-cat-2` | Stable category identity |
| `viz-cat-none` | Not recorded |
| `viz-band-*` | Range, edge, and marker for tolerance bands |
| `viz-brand`, `viz-brand-soft` | Scoped dashboard brand charts only |

Olive generally remains an action color. `viz-brand` and the current
categorical tokens are scoped exceptions for non-interactive charts. Do not
generalize them to new data surfaces without reviewing action hierarchy and
contrast.

Every value must be available without hover. Tooltips may add detail but cannot
be the only representation. Category color stays attached to the entity, not
its rank. Ordered bands use a sequential scale. Use `StatGrid`/`StatTile` for
aligned figures and `ComfortBand` only for a value against a tolerance range.

## Dark mode and scoped themes

`.dark` is the app-wide dark class. The portal also supports
`[data-theme="dark"]` and `[data-theme="system"]`. The `dark:` custom variant in
`globals.css` covers all three contexts.

The system-theme dark assignments are intentionally repeated inside the media
query. When adding a semantic token, update every dark assignment block so they
do not drift.

`.planner-theme` scopes Tajawal and the planner's cooler grid neutrals to weekly
planning routes. Do not reuse it as a shortcut for unrelated dense screens.

## Accessibility floor

- All controls must be reachable and usable by keyboard.
- Use native or shadcn/Base UI semantics before adding custom ARIA.
- Every icon-only action has an accessible name.
- Focus must remain visible in both themes and both directions.
- Touch-oriented controls are at least 48px; the documented 40px compact sizes
  are limited to dense contexts.
- Essential copy is at least 13px, normally 16px on mobile.
- Color is never the only carrier of status or selection.
- Hover-only content must also be available through focus or visible text.
- Loading must preserve layout where movement would disrupt the task.
- Arabic and English copy must tolerate longer labels without clipping or
  relying on different markup.

## Pre-handoff checklist

- Reused or extended `src/components/ui/` instead of duplicating a primitive.
- Used semantic tokens and no raw component colors.
- Checked an incumbent screen and preserved the current visual language.
- Verified Arabic RTL and English LTR.
- Verified mobile and desktop layouts.
- Checked keyboard, focus, disabled, loading, empty, error, and long-content
  behavior.
- Regenerated icons when the icon registry changed.
- Ran `bun run lint`, `bun run typecheck`, and `bun run test`.
