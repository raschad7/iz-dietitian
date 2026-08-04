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
states, the rail. Use it freely; it behaves like a neutral.

**But olive marks what you can act on.** A screen where the charts, the stat
tiles and the buttons are all olive is a screen with nothing left to say
"click here" with — that is what the dashboard looked like before the charts
moved to the neutral ramp. Data surfaces are drawn in warm neutrals and the
support hues; olive stays on the controls. See "Charts" below.

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

Warm neutrals — never pure grey, and the ramp the charts are drawn in.

| | | | |
|---|---|---|---|
| 0 `#FFFFFF` | 25 `#FCFBF7` | 50 `#F7F5EF` | 100 `#EFEDE4` |
| 200 `#E2DFD3` | 300 `#CDC9B9` | 400 `#A8A493` | 500 `#837F6E` |
| 600 `#605D50` | 700 `#46443B` | 800 `#2F2E28` | 900 `#1C1B17` |

Amber — attention.

| | | | |
|---|---|---|---|
| 100 `#FBF0D8` | 300 `#E8C46A` | 600 `#9B6A0C` | 700 `#7A5209` |

Clay — medical / destructive, the system's **only** true alarm colour.

| | | | |
|---|---|---|---|
| 100 `#FAE9E4` | 300 `#E8A08F` | 600 `#A33422` | 700 `#82291B` |

### Status is not a traffic light

`--primary-subtle` (olive-100) is the brand's quiet fill, mirroring
`--destructive-subtle`: a surface that is *about* to be primary. The dashboard
agenda's next session rests on it and fills in to solid `primary` on hover,
rather than starting solid and having nowhere to go. It is not `--secondary`
(olive-50), which is a tint — this is a fill you can read n-900 on at 14.7:1
and still see as olive against a white card.

**Anything lime sitting on it has to invert.** Lime-400 is 1.17:1 against
olive-100, so a lime chip on a resting `primary-subtle` card is invisible at
exactly the moment it has a job to do. Rest it as a solid primary chip (4.66:1
on the fill) and swap to lime on hover, where the card has gone dark and lime
measures 3.99:1.

| Meaning | Token | Colour | Never |
|---|---|---|---|
| On track | `status-on-track-*` | olive-700 on olive-100 | — |
| Needs follow-up | `status-attention-*` | amber-700 on amber-100 | red |
| Missed / incomplete | `status-incomplete-*` | neutral-700 on neutral-100 | **red** — a missed day is information, not a failure |
| Medical flag | `status-medical-*` | clay-700 on clay-100 | anything that isn't a real allergy / condition / contraindication |
| Rest day | `status-rest-*` | olive-700 on olive-50 | treating it as a missed day |
| Day completed | `status-complete-*` | flame-700 on flame-100 | amber — that already means "needs follow-up", and a finished day sharing its hue is the one confusion this scale can't afford |

`status-complete-*` also carries two graphic-only stops — `status-complete-mark`
(flame-500) and `status-complete-mark-soft` (flame-300) — for the icon and
progress ring in the portal's week strip. They are fills, never text: only the
`fg`/`bg` pair is contrast-verified (5.6:1). Flame is a **warm accent with a
budget of one per screen**, the same rule lime lives under — the portal home
screen spends it on completed days, which is why nothing else there is orange.

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
| Card | 16px | 32px | 36px (interactive only) + 2px ring | scale .995 |
| Icon button | `rounded-full` | ~29% of size | +3px | −3px |
| Bottom nav | 16px | 28px | — | — |
| Rail | **none** | **none** | — | — |
| Chips, badges | pill | **none** | — | — |

Badges are the one shape that stays a plain pill, and the rail is square on
every corner. The Arc marks surfaces you can act on: a badge is a label, and
the rail is the wall the app hangs on.

Small repeating tiles — the seven day cells in the portal's week strip, for
instance — count as chips, not surfaces: seven swept corners in a row reads as
noise rather than as the Arc.

A card can still lead a screen without being filled with brand colour: the
portal's progress card is an ordinary cream `Card` whose olive sits in the
progress ring and a soft tint behind it. A fully saturated card pulls attention
away from everything around it, which on a screen of five sections is a cost,
not emphasis.

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

**Every enabled `<button>` shows the pointer cursor.** Tailwind's v4 preflight
resets `button` to `cursor: default`, which makes a control feel inert next to
a link; `globals.css` undoes it in `@layer base` for `button:not(:disabled)`.
On the element rather than on `Button`, because Segmented, the locale switcher,
the notification trigger and the calendar's own cells all render their own
`<button>`. Being in the base layer means any `cursor-*` utility still wins, so
the calendar's drag and resize cursors need no override.

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

### The emphasised field

`.q-field-primary` gives a field the **brand edge and the brand tint** —
olive-600 border, olive-50 fill — while keeping the same box, the same height
and the same states as every other field. It marks the answers a record cannot
start without, so a long form can say "these ones" without reordering itself or
resizing anything: the client card draws name, phone, email and date of birth
this way and leaves the rest neutral.

That card (`ClientFormTrigger`) is the **only** surface a client record is
written on — creating and editing both open it over whatever screen asked, and
neither has a page of its own. A record is edited from the register, from the
record itself, and from inside the calendar's appointment card, and in none of
those places is losing your place a reasonable price for fixing a phone number.
The four core fields show first; the remaining eight sit behind a centred
disclosure that grows the card in both directions. An existing record opens
with the disclosure already open when it has anything in that half — hiding a
goal and three lines of medical notes reads as the app having lost them.

Edge and fill only. **Never a shadow and never a different size** — an
emphasised field and a plain one sit in the same grid and have to line up to
the pixel. Use it where a form is genuinely split into a core and a remainder;
a form where everything is emphasised has emphasised nothing.

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

Props: `size="sm"`, `interactive`, `selected` (the olive ring thickens; the card
does not change colour), `flagged` (a clay dot in the corner — never a red
card).

**`interactive` thickens the edge, it does not lift the card.** On hover the
ring goes to 2px olive and the tail grows; there is no shadow change. A raised
shadow reads as the card leaving the page, and on a grid of four peers — the
dashboard's quick actions — that makes the hovered one look like it belongs to
a different layer. A thicker edge says "this one" while the card stays put, and
it is the same language `selected` already speaks: the edge, never the fill.
It stays opt-in, because a card that answers the pointer is promising it does
something when clicked.

`CardSkeleton` is the loading state: same shape, same footprint, nothing jumps.

## Avatar

`Avatar` draws a person's initials on their stored colour — the calendar's
client picker, the dashboard agenda and the top-clients list all use it, so
one person looks the same everywhere. Sizes `sm` · `default` · `lg`.

It is a **circle with no sweep**: the Arc marks surfaces you can act on, and a
person is not a control. The `color` prop is per-record data, not a token (see
"Arbitrary colour" below), which is why it arrives as an inline style. It
renders `aria-hidden` — the name it stands for is always beside it.

## Tables

`TableRoot` owns the scroll container and the Arc; `Table`, `TableHeader`,
`TableRow`, `TableHead`, `TableCell` and `TableEmpty` are the rest. Cells
default to `text-start`; pass `numeric` for anything that must stay LTR inside
Arabic — figures, times, phone numbers, IDs, units.

- **`zebra`** on a row stripes the even ones with the sunken fill. It is a prop
  on `TableRow` rather than an `[&_tr:nth-child(even)]` rule on the table
  because a descendant selector outranks `hover:` on specificity and would kill
  the hover state on every striped row.
- **`linked`** marks a row that navigates as a whole. It only sets the
  positioning context — the row is made clickable by a real `<Link>` in one of
  its cells carrying `after:absolute after:inset-0`, which stretches that
  link's hit area over the row. A link and not an `onClick`, so the row keeps
  keyboard focus, middle-click, open-in-new-tab and a URL in the status bar,
  and the table stays a server component. Anything else in the row that must
  stay clickable needs `relative` to sit above the overlay.
- **Sortable columns** pair `TableHead`'s `sorted` prop (which sets `aria-sort`)
  with `TableSortLabel` (the chevron) inside whatever navigates. This app wraps
  it in a typed `<Link>` and keeps the sort in the query string, so a sorted
  table is a shareable URL and the table ships no client JavaScript. An
  unsorted-but-sortable column still shows its glyph at low opacity: a column
  that only reveals itself on hover is one nobody finds on a touch screen.

## Tooltip

`Tooltip` wraps a control and reveals the inverted `ChartTip` bubble on hover
or focus. Pure CSS — a `group` on the wrapper — so it works inside a server
component and adds nothing to the client bundle.

**It is never the accessible name.** The bubble is `aria-hidden`, exactly like
`ChartTip`; the control inside carries its own `aria-label`, and pass the same
string to both. A control whose only label is a tooltip is unusable by keyboard
and by touch. Use it for icon-only controls — the client table's row actions
are the reference case.

## Navigation

Matching [Navigation.png](design-images/Navigation.png).

**Rail** (`Sidebar`) — a pale **olive-50** column, full-bleed, separated from
the page by a 1px olive-300 `border-e`. **It is not a card**: no radius, no
Arc, no elevation. It was a solid olive-900 inset panel; that made the
navigation the heaviest thing on every screen, which is a lot of weight to
spend on furniture the reader stops seeing after a week.

**The divider is load-bearing, so it is olive-300 and not the olive-200 that
would match the rail.** olive-50 against the n-25 canvas measures 1.04:1 — the
two fills are the same lightness, so the line is not reinforcing the boundary,
it *is* the boundary. olive-200 measures 1.32:1 against the canvas and
disappears; olive-300 measures 1.68:1 and reads. Don't "tidy" it back to the
rail's own ramp.

Every item has an icon; nine text-only rows are hard to scan. The active item
is marked **three ways**: its icon, an olive-600 surface that grows around it,
and a lime **leaf** node on the inline-end edge. More than one mark because
colour alone fails for anyone who can't separate the active surface from the
rail.

A pale rail inverts two things. The active item is the **darkest** thing on the
rail rather than the lightest — olive-600 with white text, the primary button's
own 5.46:1 pairing — so the marked item still wins on contrast and not merely
on tint. And hover needs its own token (`--sidebar-hover`, olive-100): the dark
rail could use the active surface at 40%, but a translucent olive-600 over
olive-50 lands in the mid-tones where neither white nor olive text is readable.

The node stays lime-400, because it is only ever *visible* on the active item —
lime-400 on olive-600 is 3.99:1, over the 3:1 floor a graphical mark needs. It
could not sit on the rail itself, where lime is 1.37:1.

**The rail's focus ring is olive-950, not the global lime `--ring`.** Lime
measured 9.77:1 on the old dark rail and 1.28:1 on this one. Buttons get away
with a lime ring because they pair it with an olive-950 halo; the rail has one
ring and no halo, so the ring itself has to carry the contrast — 15.41:1 on the
rail, and still 3.03:1 on the active item's olive-600 surface, which is the
case that has to clear 3:1.

The node is drawn per item and animated with `transform` — not moved as one
shared element, because React would remount it on every navigation and the
travel would never play. It scales and rotates in together, so it settles
rather than snapping.

**App bar** (`Header`) — deliberately **unfilled**: no background, no border,
no elevation. With the rail now pale too, the shell has no heavy surface at
all; the page's own cards carry the weight, and the bar carries itself on type
and spacing.

Two slots: `children` sits beside the title for page-level controls, `actions`
sits beside sign-out for shell-level ones. The notification bell lives in
`actions` — it belongs to every staff screen, not to the dashboard, and its
badge counts pending *requests* only. A number on a bell promises someone is
waiting; "no meal plan yet" is a nudge, and it stays inside the popover.

**Everything in the bar is 40px.** The app bar is a toolbar, which is the one
place the pointer-only `sm` size is for: sign-out is `outline`/`sm`, the bell is
`icon-sm`, and `LocaleSwitcher` is pinned to `h-10` to match. Sign-out is
deliberately not `ghost` — the ghost compound variant drops padding to 12px,
which would make it the one control in the row not built to the button spec.

**The locale switcher appears once per screen**, in this bar (or on the login
screens, which have no bar). There is no floating copy pinned to a corner.

**Bottom bar** (`PortalTabBar`) — five-across on a phone, labels always
visible, lime node **above** the active icon rather than beside it: the bar is
horizontal, and a node on the inline-end edge would read as belonging to the
next item.

It is **edge-to-edge**: flush left, right and bottom, `radius.xl` on the top two
corners and square on the bottom two, so the bar ends where the screen does.
This is the one surface that does not take the block-end/inline-end sweep —
there is no corner there to open. The safe-area inset is padding *inside* the
bar, never a margin around it, so the fill still reaches the display edge. The
raised centre tab sits in a **notch cut out of the bar**, not on top of it: the
cut is concentric with the disc and 6px larger in radius, leaving an even ring
of page showing through. A ring of empty space, not a drawn frame.

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
  45%), not `bg-black/40`, and **blur 4px** with it: the page behind a modal is
  context, not something to read past. A surface that has the scrim behind it
  needs no shadow of its own — `Dialog`'s `flat` prop swaps the overlay shadow
  for a brand ring, the same "the edge, never a lift" language `Card` speaks.
  The blur is written as a literal `backdrop-filter` declaration rather than
  `backdrop:backdrop-blur-*`, because Tailwind's blur utilities resolve through
  custom properties registered on `*` and `::backdrop` does not inherit them in
  every engine — the utility compiles and then silently does nothing.
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

**No chart is olive.** Olive is the action colour, and a dashboard whose bars,
donut, tiles and buttons were all the same green had no way left to show which
of those you could click. Charts are drawn in the warm neutral ramp and the two
support hues; the brand shows up on the controls around them.

Three scales, each doing one job. All of them are tokens — a hex in a chart
component is the same bug it is anywhere else.

| Scale | Tokens | Job |
|---|---|---|
| Sequential | `viz-seq-1`…`5` | **magnitude** — one hue, five monotone steps, light → dark |
| Categorical | `viz-cat-1`, `viz-cat-2` | **identity** — which segment |
| Neutral | `viz-cat-none` | "not recorded" — an absence, never a third category |
| Comfort band | `viz-band-range` / `-edge` / `-marker` | the three-stop band the brand defines |

The steps were picked by running the palette validator, not by eye:

- **Sequential is n-400…800, not 200…600.** The light end has to stay visible
  on the card, and n-200 measures 1.34:1 on white, n-300 1.66:1 — both under
  the 2:1 floor a filled mark needs. n-400 is 2.50:1. `.dark` re-anchors the
  ramp (n-600 → n-200) rather than flipping it automatically.
- **Categorical is clay-600 + amber-600.** The only categorical split the app
  draws is sex, and with the sequential ramp neutral neither slot may be the
  brand colour. The pair separates on **lightness** as well as hue — 6.84:1 and
  4.71:1 on white, a 1.45:1 ratio between the two fills — which is what carries
  it through colour-vision simulation, where two warm hues collapse towards
  each other. Both clear the 3:1 mark floor unaided.
- **Inside a chart, clay and amber carry no status meaning.** Clay is the
  medical colour and amber is attention *everywhere else*; a donut segment is
  neither. That is why a categorical chart's legend is mandatory, and why no
  other surface may borrow the `viz-cat-*` tokens.
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
not scaffolded speculatively: checkbox, radio, slider, number stepper,
autocomplete, date picker with Hijri/Gregorian toggle, time picker, link tabs,
breadcrumbs, the Q-arc progress/habit ring, and toast.

When a feature needs one, build it against the rules above rather than
approximating it with a generic library component.

## Controls built from §9.3, and how they submit

`switch.tsx` and `segmented.tsx` were built against §9.3 when the client
portal's account settings needed them — the switch at 52×30 with a 24px knob
that slides on `inset-inline-start` and rotates −45° into the leaf angle, the
segmented control as a 48px sunken shell holding 40px segments.

Both are **submit buttons, not inputs**, and that is load-bearing rather than
incidental. Every setting in the portal saves to the server, so each control is
the submit button of its own single-field form: the switch carries the value it
would move to (`name="enabled" value="off"`), a segment carries the value it
selects. The whole settings screen therefore works with JavaScript off, and no
control in it has an `onChange`. If you reach for one of these in a context that
isn't a form, that's a signal the pattern doesn't fit — don't add a
`checked`-plus-callback API alongside the form one.

The switch's 30px track sits inside a 48px button so the target meets §9.3
without the shape growing. Its accessible name comes from `aria-labelledby`
pointing at the row's own label, because a `<label for>` cannot wrap a
`role="switch"` button.

**Segments use `aria-pressed`, not `role="radio"`.** A radio group promises
arrow-key navigation that plain buttons don't provide; a labelled group of
toggle buttons describes what's actually there and behaves correctly under Tab
and Enter with no key handling invented.

## Dark mode, and who it belongs to

`.dark` is the app-wide class (nothing sets it yet). `[data-theme]` is the
client portal's own switch, set on the portal wrapper in
`src/features/portal/components/portal-theme.tsx` — so a client choosing dark
never darkens the practitioner app, which shares a root layout with it.

`system` is resolved by a `prefers-color-scheme` media query in `globals.css`,
not by script: the theme has to be right on the first paint, and it must
re-evaluate when a phone flips at sunset. The cost is that the dark token block
is written twice, once for `[data-theme='dark']` and once inside the media
query for `[data-theme='system']` — **add a new token to both or they drift.**
The `dark:` variant is extended to fire in all three cases, so `dark:` utilities
inside shared `ui/` components stay correct in the portal.
