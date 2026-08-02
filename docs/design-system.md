# Design system — Qiwam / قوام

The plain-language rules for building UI in this app. Everything here is
implemented; if the code and this file disagree, that's a bug in one of them.

Reference images live in [`design-images/`](design-images/) —
[buttons.png](design-images/buttons.png) and
[Navigation.png](design-images/Navigation.png).

**Before building or touching any UI, check `src/components/ui/` first.** If a
button, card, form field, table, dialog or status badge already exists there,
use it — add a `variant` to it if it needs to differ. Don't rebuild a local
copy inside a feature folder. Something genuinely new and reusable belongs in
`src/components/ui/`, not in `src/features/<feature>/`.

## Where the tokens live

[`src/app/globals.css`](../src/app/globals.css) has four layers:

1. **Primitives** — the raw ramps (`--olive-600`, `--lime-400`, `--n-25`,
   `--clay-600`), the radius and sweep scale, shadows, and motion. Never
   referenced directly from a component.
2. **`@theme inline`** — maps primitives to semantic names and registers them
   with Tailwind, which is what makes `bg-primary`, `text-status-medical-fg`,
   `text-body` and `shadow-card` exist as utility classes.
3. **Semantic assignments** — `--primary: var(--olive-600)` and friends, plus
   the `.dark` remap.
4. **`@layer components`** — `.q-field`, `.q-label`, `.q-field-group`: the
   shared field box and its focus behaviour.

Components consume semantic tokens only. A hex or `oklch()` value inside a
`.tsx` file is a bug unless it's genuinely per-record data (see "Arbitrary
colour" below); `eslint-rules/no-raw-hex.mjs` enforces it.

## Colour

### Olive — primary

| | | | |
|---|---|---|---|
| 50 `#F5F8EF` | 100 `#E8F0DA` | 200 `#D2E2B9` | 300 `#B2CE8D` |
| 400 `#8CB35C` | 500 `#6B9639` | **600 `#4D7428`** ★ | 700 `#3D5C21` |
| 800 `#2E461A` | 900 `#223414` | 950 `#16220D` | |

**Olive is ink.** It's the primary brand colour — buttons, links, active
states, the rail, the app bar. Use it freely; it behaves like a neutral.

### Lime — accent

| | | | |
|---|---|---|---|
| 100 `#F2FBC9` | 200 `#E6F79A` | 300 `#D9F25C` | **400 `#CBEA24`** ★ |
| 500 `#B0CE12` | 600 `#8CA60C` | 700 `#6B7F0A` | |

**Lime is a fill, never a foreground.** lime-400 measures **1.37:1 on white**,
so it can't carry text, an icon, or a hairline on a light surface.

The one legal text-on-lime pairing is **olive-950 on lime-400 (12.04:1)**,
wired into `--on-accent`. Olive-600 on lime-400 is **3.98:1 and fails** — do
not build that pairing, even though "text is primary" reads naturally.

Where lime is too pale to be seen — a 2px now-line, a chart edge — use
`viz-band-edge` (lime-600), which is the darker stop the palette defines for
marking boundaries.

**No blue, anywhere.** Not links, not focus rings, not "info" banners.

### Supporting ramps

Warm neutrals `--n-0` … `--n-900` (never pure grey), amber (attention) and
clay (medical / destructive — the system's **only** true alarm colour).

### Status is not a traffic light

| Meaning | Token | Colour | Never |
|---|---|---|---|
| On track | `status-on-track-*` | olive-700 on olive-100 | — |
| Needs follow-up | `status-attention-*` | amber-700 on amber-100 | red |
| Missed / incomplete | `status-incomplete-*` | neutral-700 on neutral-100 | **red** — a missed day is information, not a failure |
| Medical flag | `status-medical-*` | clay-700 on clay-100 | anything that isn't a real allergy / condition / contraindication |
| Rest day | `status-rest-*` | olive-700 on olive-50 | treating it as a missed day |

`Badge` has a variant for each. Use them instead of ad-hoc
`bg-{color}-100 text-{color}-700` pairs. Don't reach for `destructive` to mean
"bad" in general — reach for the status that describes what actually happened.

There is **no green-means-go colour**. Calendar drag feedback uses olive for a
valid drop and clay for an invalid one, for this reason.

## Typography

| Family | Token | Role |
|---|---|---|
| Readex Pro | `font-heading` | Display / headings — `h1`–`h4` get it automatically |
| IBM Plex Sans Arabic | `font-sans` / `font-arabic` | UI, body, forms, tables |
| IBM Plex Mono | `font-mono` | Numeric / code / IDs — never client-facing prose |

All three load through `next/font/google` in
[`src/app/[locale]/layout.tsx`](../src/app/[locale]/layout.tsx); nothing needs
downloading.

**The font variables go on `<html>`, not `<body>`.** `globals.css` sets
`font-family` on the html element, and a CSS custom property is only visible to
the element that declares it and its descendants — so variables on `<body>`
leave html resolving to the `system-ui` fallback, which `<body>` then inherits
as an already-computed value. The symptom is subtle: headings look right
(because `font-heading` re-declares the family deeper in the tree, where the
variables exist) while all body text silently renders in the system font.
Form controls are fine either way — Tailwind's preflight gives
`button, input, select, optgroup, textarea` an explicit `font: inherit`.

### Scale

Nine steps. Each one owns its size, its leading **and** its weight, so a step
is one class and not three.

| Token | Size | Leading (ar / en) | Weight | Use |
|---|---|---|---|---|
| `text-display-lg` | 40px | 1.35 / 1.25 | 500 | Report covers, onboarding |
| `text-display-sm` | 32px | 1.4 / 1.3 | 500 | Screen titles |
| `text-heading-lg` | 24px | 1.45 / 1.35 | 600 | Section headings |
| `text-heading-sm` | 20px | 1.5 / 1.4 | 600 | Card titles, dialog titles |
| `text-body-lg` | 18px | 1.75 / 1.6 | 400 | Nutritionist notes, long reads |
| `text-body-md` | 16px | 1.75 / 1.6 | 400 | **Default body — mobile minimum** |
| `text-body-sm` | 14px | 1.7 / 1.55 | 400 | Dense dashboard tables |
| `text-label` | 13px | 1.5 / 1.4 | 600 | Form labels, chips |
| `text-caption` | 12px | 1.5 / 1.45 | 400 | Timestamps, helper text — **never for essential information** |

**Every step ships two line heights**, and the looser one is Arabic. Arabic has
taller ascenders and descenders and no letter case to fall back on, so leading
that reads as generous in Latin reads as cramped — and then illegible — in
Arabic well before it does the same in English. The pairs live in `--lh-*` on
`:root` (Latin) and `:lang(ar)` (Arabic); the scale references them, so a step
is declared once and resolves per document language with no component override.
`:lang(ar)` rather than `html[lang]`, so an Arabic name inside an English page
gets the right leading too.

`text-caption` is 12px and that is the floor: nothing a reader *needs* may live
there. Anything essential is `text-label` or larger.

Tailwind's own steps are remapped onto this ladder — `text-xs` → 12, `text-sm`
→ 14, `text-base` → 16, `text-lg` → 18, `text-xl` → 20, `text-2xl` → 24,
`text-3xl` → 32, `text-4xl` → 40 — because several hundred call sites predate
the named scale and remapping re-scales them all at once instead of leaving two
competing ladders in the app. **Never use an arbitrary size** (`text-[10px]`,
`text-[0.7rem]`) — see below for why.

`cn` ([`src/lib/utils.ts`](../src/lib/utils.ts)) registers this scale with
tailwind-merge. It has to: tailwind-merge only knows Tailwind's stock sizes and
files anything else called `text-*` as a *colour*, so `cn('text-caption',
'text-muted-foreground')` used to drop the size silently. Add any new step to
that list as well as to `globals.css`.

Hierarchy is carried by size **and** weight together, because Readex Pro and
IBM Plex Sans Arabic sit at similar optical weights.

### Keeping small text crisp

Small text that looks blurry or "pixelated" is almost never the font's fault.
Four things cause it, and all four are now closed:

1. **Fractional pixel sizes.** `text-[0.7rem]` is 11.2px; a glyph rasterised at
   a fractional size can't land its stems on the pixel grid. Use scale steps
   only — arbitrary sizes are banned, and the calendar's height-driven block
   type is snapped to whole pixels in
   [`geometry.ts`](../src/features/booking/geometry.ts) rather than
   interpolated continuously.
2. **Synthesised bold.** Using a weight the family wasn't loaded at makes the
   browser fake it by smearing the outlines. Every weight used with a family
   must be in that family's `weight` array in the root layout — `font-mono` at
   `font-semibold` was the live example.
3. **Too little ink.** 12px at weight 400 has nothing left to hint, so
   `text-micro` carries weight 500 by default.
4. **`antialiased`.** Forces grayscale antialiasing over the OS's subpixel
   rendering, thinning every stroke. Deliberately not on `<body>`.

**No `uppercase` and no `letter-spacing` on Arabic.** Arabic is cursive, so
tracking breaks glyph joining, and the script has no letter case for
`uppercase` to act on — it would change the English build only, and the two
would stop matching. `globals.css` zeroes both under `:lang(ar)`.

## Iconography

One set: **Solar Bold** — rounded, filled, single weight.

Icons are generated offline into
[`src/lib/icons.generated.ts`](../src/lib/icons.generated.ts) and rendered by
[`Icon`](../src/components/ui/icon.tsx):

```tsx
<Icon name="search" className="size-5" />
```

To add one, put it in `ICONS` in
[`scripts/generate-icons.ts`](../scripts/generate-icons.ts) and run
`bun run icons:generate`. `name` is a union of the generated keys, so a typo is
a build error rather than a blank square.

- Local names describe the **role**, not the picture (`myPlan`, not
  `chef-hat`), so swapping a glyph later is a one-line change.
- Icons never carry their own colour — `fill="currentColor"`, inherited from
  the control.
- Icons that encode direction (`chevronStart`, `chevronEnd`, `signOut`) mirror
  in RTL automatically. Everything else — clock, chart, checkmark, logo — must
  not, which is why `DIRECTIONAL` in `icon.tsx` is an allowlist.
- `@iconify-json/solar` is a **devDependency**: a build input, never shipped.

## Shape — "the Arc"

Three corners hold the system radius; the **block-end / inline-end** corner
opens into a sweep — the Q's tail. `rounded-ee-*` is logical, so it mirrors to
bottom-left in Arabic with no override.

**One tail per surface.** Never sweep two corners, and never repeat the sweep
on a child of an already-swept parent.

| Surface | Base | Sweep | Hover | Press |
|---|---|---|---|---|
| Button, field | 10px | 24px | 30px | 18px + 1px sink |
| Card | 16px | 32px | 36px (interactive only) | scale .995 |
| Icon button | `rounded-full` | ~29% of size | +3px | −3px |
| Rail, bottom nav | 16px | 28px | — | — |
| Chips, badges | pill | **none** | — | — |

Badges are the one shape that stays a plain pill. The Arc marks surfaces you
can act on; a badge is a label.

Radius scale otherwise: `sm` 8 · `md` 12 · `lg` 16 · `xl` 24. **Never
`rounded-none`** — except `Button variant="link"`, which is a run of text, not
a surface.

The sweep sizes are tokens (`--sweep-control`, `--sweep-card`,
`--sweep-surface`), so changing the shape language is a token edit.

## Buttons

Six variants, matching [buttons.png](design-images/buttons.png):

| Variant | Rest | Hover |
|---|---|---|
| `default` | olive-600 fill, white label (5.46:1) | olive-700 |
| `outline` | white, olive border + label | lime-400 fill, olive-950 label |
| `ghost` | no box, olive label | lime-400 fill, olive-950 label |
| `accent` | lime-400 fill, olive-950 label | lime-300 |
| `destructive` | white, clay border + label (6.84:1) | clay-100 fill (5.81:1) |
| `default` + any `icon*` size | olive-50 fill, olive-200 border, olive glyph | olive-100 |

Plus `secondary` (olive-50 tint) and `link`, which aren't in the six but keep
dense surfaces off ad-hoc classes.

Disabled keeps the resting tail and drops to the sunken fill with n-500 text
(4.0:1) — a control that still animates reads as available.

### Dimensions

| Size | Height | Use |
|---|---|---|
| `default` | **48px** | Everything. The mobile touch-target minimum, and a control that is comfortable on a phone is not uncomfortable on a desktop. |
| `sm` | **40px** | The compact size, **pointer-only**: toolbars and table rows, where the dense row is itself the target. |
| `icon` | **48×48** | |
| `icon-sm` | **40×40** | Pointer-only, same rule as `sm`. |

There is no size above 48 and none below 40. Reaching for a smaller control to
fit more onto a screen is a layout problem, not a button problem.

**Max width 320px, and labels never wrap** — both are on the base class
(`max-w-80`, `whitespace-nowrap`). A label that needs two lines is a label that
needs rewriting.

### Spacing

- **Padding: 0 20px.** Tertiary (`ghost`, `link`) takes 0 12px instead — a ghost
  button has no box at rest, so the wider padding reads as a gap someone forgot
  rather than as part of the control.
- **Icon-to-label gap: 8px** (`gap-2`), every size.
- **Sibling buttons sit 12px apart** (`gap-3` on the group).
- **The primary sits at the inline-start of the group, in both locales.** Use
  logical ordering — source order plus `flex`, never `flex-row-reverse` or a
  hardcoded side — so Arabic mirrors it for free.

Fields match the same geometry (48px tall, 20px padding, `min-h-24` on
`Textarea`): a field and the button that submits it share a row, and a 36px
input beside a 48px button is the tell that one of them was resized alone.

## Fields and forms

Every field is `.q-field` — one class in `globals.css` shared by `Input`,
`Textarea` and `Select`, so the three cannot drift and a change to the shape
language is one edit.

- **Focus** draws the arc: a 2px olive line grows from the tail along the
  block-end edge to 58% of the width, in 220ms. Width only, no colour flash.
  It reverses in 140ms on blur — faster, because the cue has served its
  purpose.
- Fields deliberately **do not** use the lime focus ring buttons use. A form
  has many fields, and lime firing on every tabbed-to field turns the accent
  into noise. Fields get `border-primary` plus a 3px olive-100 halo.
- **Hover** darkens the border to n-600. **Read-only** is a sunken fill with no
  border and no sweep. **Disabled** is the sunken fill at 50%.
- Wrap a label and its control in `Field` — that's what drives the label's
  colour shift on focus (`:focus-within`) and gives `FieldError` somewhere
  reliable to live.
- **Validate on blur, never per keystroke.** A message that arrives mid-typing
  is describing a half-finished value. Error entrance is an opacity fade, never
  a shake.

`Select` is a real native `<select>` with `appearance: none` and our own
chevron — Chrome pins its built-in arrow to the border and ignores
`padding-inline-end`, so long option text collides with it. Keyboard
behaviour, screen-reader semantics and the mobile picker still come free.

## Cards

Anatomy: `CardHeader` (title + optional `CardAction` marker) · `CardContent` ·
optional `CardDivider` · `CardFooter` (metadata inline-start, action
inline-end).

Variants: `default` · `tinted` · `empty` (dashed olive-300, for empty states) ·
`listRow` (no shadow, no sweep except on the last row of a group) · `archived`.

Props: `size="sm"`, `interactive` (hover lift + tail growth — opt-in, because a
card that lifts is promising it does something), `selected` (the olive ring
thickens; the card does not change colour), `flagged` (a clay dot in the
corner — never a red card).

`CardSkeleton` is the loading state: same shape, same footprint, nothing jumps.

## Avatar

`Avatar` draws a person's initials on their stored colour — the calendar's
client picker, the dashboard agenda and the top-clients list all use it, so
one person looks the same everywhere. Sizes `sm` · `default` · `lg`.

It is a **circle with no sweep**: the Arc marks surfaces you can act on, and a
person is not a control. The `color` prop is per-record data, not a token (see
"Arbitrary colour" below), which is why it arrives as an inline style. It
renders `aria-hidden` — the name it stands for is always beside it.

## Navigation

Matching [Navigation.png](design-images/Navigation.png).

**Rail** (`Sidebar`) — a solid olive-900 panel, inset on the canvas so it
carries the Arc. Every item has an icon; nine text-only rows are hard to scan.
The active item is marked **three ways**: its icon, an olive-700 surface that
grows around it, and a lime **leaf** node on the inline-end edge. More than one
mark because colour alone fails for anyone who can't separate olive-700 from
olive-900.

The node is drawn per item and animated with `transform` — not moved as one
shared element, because React would remount it on every navigation and the
travel would never play. It scales and rotates in together, so it settles
rather than snapping.

**App bar** (`Header`) — deliberately **unfilled**: no background, no border,
no elevation. The rail is the shell's only heavy surface, so the eye has one
place to go; the bar carries itself on type and spacing.

Two slots: `children` sits beside the title for page-level controls, `actions`
sits beside sign-out for shell-level ones. The notification bell lives in
`actions` — it belongs to every staff screen, not to the dashboard, and its
badge counts pending *requests* only. A number on a bell promises someone is
waiting; "no meal plan yet" is a nudge, and it stays inside the popover.

**Bottom bar** (`PortalTabBar`) — five-across on a phone, labels always
visible, lime node **above** the active icon rather than beside it: the bar is
horizontal, and a node on the inline-end edge would read as belonging to the
next item.

**Segmented** (`Segmented`) — two to four mutually exclusive options, all
visible. The track carries the Arc; the thumb does not, because one tail per
surface. `role` is a prop: the calendar's day/week/month switch is a `tablist`
(same page, different view), the login role switch is a `radiogroup` (different
form). Identical visually, different to a screen reader.

Staff and portal share `Sidebar`. The portal passes icons (`PORTAL_NAV_ICONS`,
the same glyphs as its bottom bar); the staff rail is text-only.

## Spacing, shadows, motion

- Spacing is Tailwind's 4px scale. Card padding is `--card-spacing`, 16px
  mobile / 20px desktop.
- Shadows are **olive-tinted, never neutral black** — `shadow-card` /
  `shadow-elevated` / `shadow-overlay`. Scrims use `--overlay` (olive-950 at
  45%), not `bg-black/40`.
- One easing curve for every sweep and drawing animation:
  `cubic-bezier(.2,.6,.2,1)`. Durations are named: `--duration-arc` 220ms
  (field arc, node travel) · `--duration-sweep` 200ms (corner growth) ·
  `--duration-label` 180ms · `--duration-reverse` 140ms (anything reversing on
  blur). Don't invent a new curve.
- `prefers-reduced-motion: reduce` collapses every transition globally. State
  still changes; only the travel stops.

## RTL — logical properties only

Arabic (RTL) and English (LTR) ship from the same components. A physical
`pl-4` / `text-left` that looks right in English is silently wrong in Arabic,
and the bug is invisible until someone reads the RTL build.

- Use `ms-*` / `pe-*` / `text-start` / `border-s-*` / `end-*` — never the
  physical equivalent. `eslint-rules/logical-properties.mjs` makes this a lint
  error.
- CSS gradients take angles and have **no** logical direction keyword. A
  `to right` fade runs the wrong way in Arabic and looks fine in English —
  use an inset (`me-*`) or `:dir()` instead.
- Numbers, times, phone numbers, IDs and units keep LTR internal order inside
  RTL text. `Table`'s `numeric` prop does this for a column.
- Progress fills, sliders and comfort bands originate from the **inline-start**
  edge.

## Arbitrary colour, not a token

A client's calendar colour (`clients.color`), a practitioner's colour, and
`src/lib/avatar-color.ts` store a genuinely arbitrary hex per record. These
were never meant to come from the brand palette — they exist so people are
distinguishable from one another. That's why the no-raw-hex rule is scoped to
`.tsx`/`.jsx`: those values live in `.ts` data files.

A **brand** colour hardcoded in a component is a bug. Replace it with the
token; don't add it to this exemption.

The one deliberate exception in markup is the WhatsApp QR code, which needs
true white (`--n-0`) for scanner contrast rather than the warm canvas tint.

## Charts

Three scales, each doing one job. All of them are tokens — a hex in a chart
component is the same bug it is anywhere else.

| Scale | Tokens | Job |
|---|---|---|
| Sequential | `viz-seq-1`…`5` | **magnitude** — one hue, five monotone steps, light → dark |
| Categorical | `viz-cat-1`, `viz-cat-2` | **identity** — which segment |
| Neutral | `viz-cat-none` | "not recorded" — an absence, never a third category |
| Comfort band | `viz-band-range` / `-edge` / `-marker` | the three-stop band the brand defines |

The steps were picked by running the palette validator, not by eye:

- **Sequential is olive-400…800, not 200…600.** The light end has to stay
  visible on the card, and olive-200 measures 1.28:1 on white, olive-300
  1.73:1 — both under the 2:1 floor a filled mark needs. `.dark` re-anchors the
  ramp (olive-600 → olive-200) rather than flipping it automatically.
- **Categorical is olive-600 + lime-600, and that pairing is not a taste call.**
  It is the only one in this brand that survives colour-vision simulation:
  olive against amber-600 collapses to ΔE 1.5 under protanopia and against
  clay-600 to 1.9 under deuteranopia — invisible in practice. Lime-600 sits at
  2.77:1 on white, just under the 3:1 mark floor, so **any chart using slot 2
  must carry visible labels**; the legend is the required relief, not decoration.
- **Colour follows the entity, never its rank.** Female is always slot 1,
  male always slot 2, so a shifting balance never repaints the chart.
- Ordered categories — age bands, tiers, funnel stages — are **ordinal**: they
  take the sequential ramp read in order, never one hue each. Reordering them
  would change the meaning, and colour should show that.
- Marks are chunky rather than hairline — the dashboard reads at a glance from
  a desk, not from a spreadsheet. Columns cap at 56px wide with an 8px rounded
  data-end and a square baseline; horizontal bars are 16px in a track of the
  same radius; the donut ring is 9 of its 42 viewBox units. Axes and rules stay
  hairline and solid, never dashed.
- **Every mark answers the pointer.** A column lifts 4%, a bar's track
  thickens to 20px, a donut segment scales 6% and its stroke grows — all on the
  system's one easing curve, so `prefers-reduced-motion` collapses them with
  everything else. `ChartTip` (`src/components/ui/chart-tip.tsx`) is the bubble
  they show; positioning belongs to the chart, since a column, a bar and a ring
  segment anchor it in three different places.
- The hover state is pure CSS — no chart is a client component. A donut segment
  and its tip cannot be parent and child, so they are linked with `:has()` on
  their common ancestor; the selectors have to be literal strings for Tailwind
  to compile them.
- Every value is readable **without** hovering — an axis label, a direct label
  or the legend. A tip may add to that; it may never be the only way, which is
  why `ChartTip` is `aria-hidden` rather than announced twice.

`--color-chart-1`..`5` predate these and remain for anything that needs a
fifth and sixth hue; prefer the `viz-*` scales, which are validated.

## Not built yet

These are described by the brand but have no caller in the app, so they were
not scaffolded speculatively: checkbox, radio, switch, slider, number stepper,
autocomplete, date picker with Hijri/Gregorian toggle, time picker, link tabs,
breadcrumbs, the Q-arc progress/habit ring, streak-week and 4-week-adherence
components, and toast.

When a feature needs one, build it against the rules above rather than
approximating it with a generic library component.
