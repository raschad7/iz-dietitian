# Enzyme design system / نظام تصميم إنزيم

This file is the concise, authoritative UI contract for Enzyme. It describes the
design system that is implemented now: a bilingual, RTL-first application built
primarily from reusable shadcn components adapted to Enzyme's visual language.

> The product was previously called **Qiwam / قوام**. Dated design records under
> `docs/superpowers/` and `.impeccable/` still use that name and describe older
> states of this system — including the olive-and-lime palette and the Q-shaped
> Arc, both of which are gone. When one of them disagrees with this file, this
> file wins.

Use the following sources in this order when they disagree:

1. Reusable component behavior and variants in [`src/components/ui/`](../src/components/ui/).
2. Semantic tokens and global utilities in [`src/app/globals.css`](../src/app/globals.css).
3. The rules in this file.
4. Existing feature screens.
5. The standalone studies in [`design-prototypes/`](../design-prototypes/) as
   visual references only.

The prototypes are colour and layout studies, not production code, and several
predate the current brand. They can clarify the intended character of the
product, but they never override current shared components, tokens,
accessibility behavior, or this contract.

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
RTL support. Enzyme depends heavily on that component model:

- shadcn/Base UI supplies tested primitive behavior and composition patterns;
- `src/components/ui/` owns the repository's installed and adapted versions;
- semantic tokens give those components Enzyme's appearance;
- feature code composes them into product workflows.

An upstream shadcn component is a starting point, not permission to bypass the
local system. When adding or updating one, review the generated diff carefully:
preserve Enzyme tokens, sizes, focus behavior, RTL logic, popup behavior, and
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
| Navigation | `Sidebar`, `Tabs`, `PanelTabs`, `Pagination`, `FitRows` |
| Data display | `Table`, `Chart`, `ChartTip`, `StatGrid`, `StatTile`, `Progress`, `ComfortBand`, `Timeline` |
| Feedback | `Callout`, `EmptyState`, `Spokes`, `Spinner`, `PageLoading` |
| Identity and graphics | `Avatar`, `Icon`, `Caret` |

Some files export several parts. Compose those parts rather than rebuilding the
same anatomy. For example, use `CardHeader`, `CardContent`, and `CardFooter`;
use the `Select` parts for a rich list and `SelectField` for a flat option list.

## Design principles

- Clinical clarity comes before decoration.
- The dietitian remains in control of generated, reviewed, and published data.
- Green identifies brand and action; it is not a universal data color.
- The light green accent is a scarce fill, not readable foreground ink.
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

1. Raw primitives such as `--green-*`, `--n-*`, `--c-*`, and
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
| Primary | `--green-*` | Primary actions, links, active states, actionable emphasis |
| Accent | `--green-*` (light steps) | Scarce fills, completion emphasis, chart range edge |
| Warm neutrals | `--n-*` | Text, borders, cards, shadows, most chart marks |
| Cool neutrals | `--c-*` | Muted surfaces, hover fills, sidebar, planner grid |
| Attention | amber | Follow-up, caution, incomplete information that needs action |
| Medical/destructive | clay | Allergies, contraindications, destructive actions |
| Completed-day accent | flame | Portal completion marks only; one warm accent per screen |

Rules:

- The accent green is a fill, never text or an icon on a light background.
  Use `text-on-accent` on `bg-accent-green`.
- Do not introduce blue for links, focus, or informational notices.
- Do not use clay as a generic “bad” color.
- Do not mix warm and cool neutral surfaces arbitrarily. Use the semantic token
  selected for the surface.
- `--primary` is the brand green `#75CF48` in both light and dark;
  `--primary-hover` is green-600 in light and steps *up* to green-300 in dark,
  where a hover has to move towards the light to read as a response.
- **There is one green family.** A second, yellow-green "lime" accent ramp
  (`#CBEA24` and neighbours) was removed; every green surface, fill, edge and
  mark now resolves to a step of `--green-*`. Do not reintroduce a second green,
  and do not pin a green hex at a call site — take a step.
- White text on `--primary` is a known ~1.95:1 contrast exception, carried by
  the `default` Button variant alone. Do not extend that pairing to body copy or
  new non-control surfaces. Prefer a passing token combination when creating new
  patterns — see *One green, and what it costs* under **The brand mark**.

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

**One documented exception to inherited color:** the fourteen glyphs on نمط
الحياة والعادات in the client record, tinted through `--intake-icon-*`. That
card is a 4×4 lattice of `text-label` rows, and the tint is what lets a reader
find one answer without reading the thirteen beside it. The tint marks the
*subject* of a question, never the client's answer to it, and it reuses existing
palette stops — no new hue was added for it. Nothing outside that card may reach
for these tokens; new icon color is a change to this section, not a call site.

**Two names may share a glyph; two rows of one screen may not.** Sharing is fine
across the app — `dish` and `mealDinner` are both `Utensils` and never meet. It
stops being fine when the duplicates land in the same list, where the glyph is
what the reader is scanning by: `privacy` and `security` were both `ShieldCheck`
six rows apart in the portal's settings. Give one of them its own name and its
own picture rather than re-pointing a shared one — `refresh` and `close` are
drawn by the whole app, so the portal's request rows got `rescheduleRequest` and
`cancelRequest` instead.

## The brand mark

The product is **إنزيم / Enzyme**. Its logo has one source of truth:
[`src/features/brand/logo.ts`](../src/features/brand/logo.ts) — the path data
and the three brand colours, which mirror `--brand-leaf`, `--brand-seed` and
`--brand-wordmark` in `globals.css`. Change one side and change the other.

### One green, and what it costs

`--primary` and `--brand-leaf` are both `#75CF48` — step 400 of the brand ramp.
The action colour and the logo are deliberately the same green; `--primary-hover`
is step 600 (`#419020`) from that ramp. Both are pinned literals, not steps of
`--green-*`, which is a different curve with no stop on either value. Change one
and change the other in the same commit.

**The cost is contrast, and it is real.** White on `#75CF48` measures about
1.95:1, down from ~2.68:1 on the `#72AE34` this replaced. WCAG AA asks 4.5:1,
so the white-on-primary pairing was already an exception and is now a larger
one. It applies to exactly one thing: the `default` Button variant, which wears
`--primary-foreground-white`.

`--primary-foreground` (n-900) measures about 10.8:1 on the new fill — it
improved. Prefer it, or the `soft` and `neutral` variants, anywhere a label has
to be *read* rather than pressed: dense lists, small controls, long copy.
Switching `default` to n-900 is a one-line change if the pairing is revisited.

Two lockups, and which one to use follows the ground:

- **On a light or neutral surface**, the mark in its own colours. In the app,
  that is [`BrandLogo`](../src/components/layout/brand-logo.tsx) — inline SVG,
  so the wordmark can flip on the dark rail. It is `aria-hidden` by default;
  pass `aria-hidden={false}` with `role="img"` and a label only where it is the
  page's only identification (the sign-in screens and the landing page do).
- **On a coloured or unknown ground**, the reversed lockup: a white leaf with
  the seeds punched back to the ground colour. This is the brand sheet's own
  second lockup, not an inversion invented per surface.

Outside React — app icons, the social card, email, print — nothing can read a
token, so those draw from the same module through `renderBrandMarkSvg` /
`renderBrandLockupSvg`. The static files in `public/brand/` are generated:

```bash
bun run brand:build
```

Where each one lands:

| Surface | Asset |
| --- | --- |
| Browser tab | `public/brand/mark.svg`, via `icons.icon` in the locale layout |
| Older browsers, link bots | `public/favicon.ico` — 16/32/48px, generated |
| Home screen, PWA install | `/api/pwa-icons/{192,512,maskable-512,apple-180}` — reversed on a green tile |
| Link previews (WhatsApp, Open Graph) | `src/app/[locale]/opengraph-image.tsx` |
| Email, printed plans, anything off-app | `public/brand/{mark,logo}{,-on-color}.svg` |

Do not add a fourth copy of the artwork. If a surface needs the mark in a size
or colour that is not here, add it to the generator.

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
  green-tinted. Scrims use `--overlay`, not black. Over a photograph use
  `--overlay-strong`, which is the same green one step heavier — a dialog scrim
  only pushes the page back, while an image carrying UI has to give up enough of
  its own contrast to read as a background.
- Use the shared motion tokens: `--ease-sweep`, `--duration-arc`,
  `--duration-sweep`, `--duration-label`, `--duration-reverse`, and
  `--duration-travel`.
- `--duration-travel` is reserved for an entire surface crossing the screen.
- Page **entrances** are the one exception and carry their own numbers, written
  beside their keyframes in `globals.css`: the launch screen, the 404 screen,
  and the sign-in screen. The `--duration-*` tokens measure a reaction to
  somebody, and an introduction is not one — so do not stretch a token to cover
  one, and do not reach for an entrance where a reaction is what is wanted.
- Before adding an entrance, check whether the launch screen plays over the same
  route. `SplashLaunchGate` is mounted from `[locale]/layout.tsx`, so it covers
  the public screens too, and an entrance timed from first paint will run to
  completion underneath a full-screen tile and never be seen. `.q-auth-*` holds
  itself at its first frame while `.q-splash` is in the document; copy that.
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
- One exception: the staff app draws a grey rail on desktop pointers. It is
  scoped to `.q-desk-scrollbars` (passed by the staff layout to `AppShell`) and
  gated on `(width >= 64rem) and (pointer: fine)`, so the client portal, phones
  and tablets keep bare scrollers. It covers the shell scroller, dialog bodies,
  and anything marked `q-scrollbar`; the cue rule above still applies, because
  most viewports never see the rail. Colors come from the `--scrollbar-*`
  tokens in [`globals.css`](../src/app/globals.css).

### Viewport height, the keyboard, and the safe area

Three tokens in [`globals.css`](../src/app/globals.css) describe the screen. Use
them; do not re-derive any of them at a call site.

| Token | What it is |
|---|---|
| `--q-safe-t` / `-b` / `-l` / `-r` | `env(safe-area-inset-*)`, with the `0px` fallback already written |
| `--q-keyboard-inset` | How much of the layout viewport the software keyboard covers; `0px` otherwise |
| `--q-viewport-block` | `100dvh` less that inset — **the block extent a surface may actually occupy** |

Rules:

- **Never size a surface in `100vh`.** `vh` is frozen at the large viewport, so
  it overshoots the screen for as long as a phone's address bar is showing.
- **`100dvh` is only correct where a keyboard cannot appear.** `dvh` shrinks
  with the address bar but not with the keyboard: `interactiveWidget:
  'resizes-content'` makes Android shrink the layout viewport, and iOS Safari
  ignores it. Anything that can contain a field — a dialog, a sheet, a popover
  with a search box — measures against `--q-viewport-block` instead.
- A surface pinned to the block-end edge also needs `inset-block-end:
  var(--q-keyboard-inset)`, or it stays on an edge that is now behind the keys.
  Never lift it with a `transform`: that makes it the containing block for the
  popup positioners portaled into it.
- `viewport-fit=cover` is on, so anything touching an edge owes that edge its
  inset — as padding, so the surface's own fill still reaches the glass.

`KeyboardInset` in [`keyboard-inset.tsx`](../src/components/ui/keyboard-inset.tsx)
publishes the keyboard token from the root layout. It is mounted once; nothing
else should read `window.visualViewport`.

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
| `accent` | Rare accent-green completion action |
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
- Focus uses the green edge without changing box dimensions.
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

### A page of a list is what the frame holds

**Never pick a page size by hand.** A number chosen because "it fits a laptop"
fits the one screen it was measured on: a 1366×768 laptop, a 1080p panel at 125%
scaling and a browser at 110% zoom all hold fewer rows, and on each of them the
pager — the only way through the list — falls below the fold or outside a
bounded frame entirely.

Measure instead. `FitRows` in
[`fit-rows.tsx`](../src/components/ui/fit-rows.tsx) reads the bounded region a
list is drawn in and answers how many rows fit; three data attributes are the
whole contract:

| Attribute | On | What it is |
|---|---|---|
| `data-fit-region` | the bounded box | the height a page of the list gets |
| `data-fit-row` | each row | one unit of the list |
| `data-fit-footer` | the pager | held at the foot of the region by `mt-auto` |

Two shapes, one measurement:

- A list paged by a **server query** renders `<FitRows>`, which writes the count
  to a cookie and refreshes. The register and Bills share one cookie name.
- A list paged in the **browser** calls `useFittingRows` and slices in place. No
  cookie, no round trip — the expenses card on a client's record.

Rules:

- The region must be bounded, or there is nothing to fit into. Bound the page
  column to the shell from `lg` up (`lg:h-full lg:min-h-0`) and give the region
  `flex-1` with `lg:min-h-0`; below `lg` the page scrolls as one and the list
  asks for its `fallback` size.
- Clamp with `{ min, max, fallback }`. `fallback` is what the first paint draws
  before anything has been measured, and it is the phone's answer too.
- The list still needs a real overflow fallback under `min`. Prefer
  `overflow-y: auto` on the frame over `hidden`; a clipped pager is a control
  nobody can reach.

### Dialogs, sheets, menus, tooltips, and toast

- Use `Dialog` for focused modal tasks and `Sheet` for secondary mobile/edge
  surfaces.
- A dialog must have an accessible label and a deliberate dismissal policy.

#### The responsive frame — do not write one per dialog

Every `.q-dialog` gets a frame from `globals.css`: a height ceiling bound to
`--q-viewport-block`, a flex column, a header and footer that stay, and a body
that scrolls. **Composing `DialogHeader` / `DialogBody` / `DialogFooter` is what
opts a surface in.** `Sheet` gets the same frame through `SheetBody`.

So a new dialog needs *no* responsive class. In particular, do not add:

- `max-h-[90dvh]`, `h-[…dvh]`, or any other viewport height — the ceiling is
  already there, already keyboard-aware, and already tighter than a hand-written
  one on a landscape phone;
- `open:flex open:flex-col` — the frame supplies both;
- `overflow-hidden` — the frame clips only when there is a body to scroll, and
  deliberately does not when there is not.

Two consequences worth knowing:

- These declarations are **unlayered**, so they beat any Tailwind utility on the
  element. A `max-h-[…]` at a call site does nothing at all. To make one surface
  shorter than the screen allows, set `[--q-dialog-max-block:32rem]` (or
  `[--q-sheet-max-block:…]`); the frame takes the smaller of that and what the
  screen can show, so taste can tighten the ceiling and never remove it.
- Put the middle of the surface in `DialogBody`. Content outside it is in the
  header/footer band and will not scroll.

`src/components/ui/dialog-responsive.test.ts` asserts all of this against the
stylesheet and against the call sites the frame replaced.
- G. Seam is the standard `Dialog` and `ConfirmDialog` transition: the surface
  reveals from its horizontal midpoint and closes back into it. Planner context
  sheets and application navigation drawers keep their own directional motion.
- A conditionally rendered dialog must use `useDialogPresence(open)`. When the
  dialog needs a state payload to paint its closing frame, use
  `useDialogPresenceValue(value)` and pass the real desired-open boolean into
  `Dialog`; never remove the subtree on the same render that closes it.
- Dialog content motion belongs only to `DialogHeader`, `DialogBody`, and
  `DialogFooter`. Do not animate arbitrary dialog children or descendants:
  calendars, selects, comboboxes, and popovers portal their positioners into
  the native dialog, and transforming one while it measures can dismiss it.
- Use `DropdownMenu` for action menus and profile menus.
- Tooltips supplement an accessible name; they never replace `aria-label`.
- Use the shared `toast`/`Toaster` API for transient confirmation that warrants
  a global message. Prefer inline status when the result belongs to a visible
  section.
- Avoid nested interactive triggers such as a tooltip trigger wrapping a menu
  trigger when the primitive composition does not support both.

### Empty, loading, and status feedback

- `EmptyState` explains what is missing and offers at most one clear next action.
- `PageLoading` is the only loading screen. Every `loading.tsx` renders it and
  nothing else: one `Spokes` mark in `text-spinner`, centred on the page, no
  tracing of the page that is coming.
- `Spokes` is that mark — eight spokes, from the `@loading-ui` registry recorded
  in `components.json`. It draws in `currentColor`; the screen picks the green.
- `Spinner` stays for bounded action progress *inside a control* — a submitting
  button, a field resolving. It is the `refresh` glyph, not the page mark, and
  the two are not interchangeable: one says "this control is working", the other
  says "this screen is not here yet".
- **There are no skeletons.** The `Skeleton` component and the `.q-skeleton`
  sweep were removed. A skeleton is a second copy of a layout that has to be
  kept in step with the real one by hand, and it guesses at counts it cannot
  know — six register rows for a clinic with two. Do not reintroduce one, and do
  not hand-roll the effect with `animate-pulse` on grey blocks.
- **Keep every `loading.tsx` file.** They are not decoration: a route without one
  does not commit its navigation until the server has finished the page, and
  Next will not prefetch a dynamic route past its nearest boundary. Deleting one
  because "it only renders a spinner now" costs both.
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
