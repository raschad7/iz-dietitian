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
   `--clay-600`), the radius scale, shadows, and motion. Never referenced
   directly from a component.
2. **`@theme inline`** — maps primitives to semantic names and registers them
   with Tailwind, which is what makes `bg-primary`, `text-status-medical-fg`,
   `text-body` and `shadow-card` exist as utility classes.
3. **Semantic assignments** — `--primary: var(--olive-500)` and friends, plus
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
| 400 `#8CB35C` | **500 `#6B9639`** ★ | 600 `#4D7428` (hover) | 700 `#3D5C21` |
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
wired into `--on-accent`. Primary on lime-400 is **2.54:1 and fails** (so did
olive-600, at 3.98:1) — do not build that pairing, even though "text is
primary" reads naturally.

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

Cool neutrals — the second family, and deliberately only the stops the app
draws with.

| | | | |
|---|---|---|---|
| 50 `#F9FAFB` | 100 `#F3F4F6` | 200 `#E5E7EB` | 300 `#D1D5DB` |
| 600 `#4B5563` | | | |

They are `--c-*` primitives, not hexes at the call site. They used to be four
loose literals — the rail's surface, hover and divider, the board's hairline and
secondary text — repeated wherever they were needed, which is how a palette
drifts.

**`--muted` and `--accent` are cool.** The sunken fill is the app's
most-repeated surface — every table header, every zebra row, every read-only
field — and drawn in the warm n-50 it laid a cream tint over screens whose
canvas is plain white. It is **c-100**, and the step matters: c-50 is 1.02:1
against white, below where a fill still registers as one, and the register's
header strip disappeared into the card at that value. c-50 is right for the
*rail*, which has a load-bearing divider doing the separating for it; a strip
in the middle of a card has only its own fill. c-100 is 1.06:1 — quieter than a
colour, a hair firmer than the n-50 it replaced.

`--accent`, the ambient hover tint, follows it to **c-200**, one step past.
It has to: the register's sortable column heads are `hover:bg-accent` drawn
directly on the `bg-muted` strip, so a warm tint on a cool fill put the two
families in contact at the same lightness, which reads as a rendering fault
rather than as a hover.

The rest of the ramp is where it was: the **rail** (c-50 surface, c-100 hover,
c-300 divider), the **weekly planner board** — which keeps its *own* lighter
`--muted`/`--accent` of c-50/c-100, because thirty-five hairline cells on a
clinical white page is a different problem from a strip on a card — and the
**auth screens** (the rail's c-50 as `--auth-canvas`).

Nothing else may cross between the two families: a warm neutral used as a
surface beside a cool one is how a palette starts looking accidental.

The rail, the board and the auth page are whole surfaces, which was the original
condition for reaching over here at all. The board is a grid of
thirty-five hairline cards, so almost everything drawn on it is an edge — and
thirty-five warm n-200 edges tint the page even though the page itself is
`#FFFFFF`. Swapping the four neutrals it actually draws with (`--border`,
`--muted`, `--accent`, `--muted-foreground`) is what makes it read as clinical
white rather than as cream. `#4B5563` measures **7.46:1** on white, clearing the
6.38:1 floor `--muted-foreground` holds elsewhere. See "The planner's own
theme" under Typography.

The auth screens meet the same condition from the other direction: they are a
single card on an otherwise empty page. On the white canvas the card had nothing
to be a surface *against*, and warming the page to n-25 put a tint under a card
whose own brand panel is already the loudest thing on the screen. It is a token,
`--auth-canvas`, and not a repeated hex — a second use of a value is exactly
where a palette starts to drift.

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
exactly the moment it has a job to do. Rest it as a solid primary chip and swap
to lime on hover, where the card has gone dark and lime measures 3.99:1.

⚠ That resting chip was 4.66:1 against the olive-100 fill when primary was
olive-600; on olive-500 it is **2.96:1**, a hair under the 3:1 two adjacent
fills need to be told apart. It is the same trade the primary button makes
below.

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

### A badge is a state, and it has a budget

**A pill marks a record's state. It is not how you render a fact.** The client
record is the cautionary case: it carried a status pill in the header, a count
pill on a tab, goal and activity-level pills in one card header, a meal-count
pill in another, a "clinic only" pill in a third, and a row of allergen pills in
a fourth — nine filled shapes on one screen, at which point none of them marked
anything. Every one of those except the allergens was a *fact* about the client,
and a fact is words: "الهدف المحافظة على الوزن" reads faster than the same
string inside a tinted capsule, and costs no ink that a reader has to decode.

Three tests before reaching for one:

- **Is it a state, or a value?** Published / archived / active is a state.
  A goal, a count, a category and a name are values.
- **Does it vary?** A pill that reads the same on almost every record marks
  nothing. The header's status pill said "نشِط" on virtually every client ever
  opened; it now renders only when the record is *archived*, which is the
  reading worth interrupting for.
- **Is it already the loudest thing there?** The allergen pills sat at the top of
  the allergy card. Clay type in the card's own list says it just as clearly
  without a second shape around it.

One or two per screen. If a surface needs more than that, the surface is
describing things, not marking them.

There is **no green-means-go colour**. Calendar drag feedback uses olive for a
valid drop and clay for an invalid one, for this reason.

## Typography

| Family | Token | Role |
|---|---|---|
| **Almarai** | `font-sans` / `font-arabic` / `font-heading`, **Arabic only** | Everything in Arabic — body, forms, tables **and headings** |
| Readex Pro | `font-heading` **in English** | Display / headings — `h1`–`h4` get it automatically |
| IBM Plex Sans Arabic | `font-sans` / `font-arabic` in English | Body and UI in English, and the Arabic fallback |
| IBM Plex Mono | `font-mono` | Numeric / code / IDs — never client-facing prose |

Every family, Almarai included, loads through `next/font/google` in
[`src/app/[locale]/layout.tsx`](../src/app/[locale]/layout.tsx) — Almarai is
OFL-licensed, so unlike its predecessor (Neo Sans Arabic, a paid Monotype face
self-hosted from `src/app/fonts/`) it needs no local files: Next fetches and
self-hosts it at build time like every other family here.

### The Arabic face is Arabic-only

**Two real weights, and they cover four.** Almarai ships static 400/700/800
files and has no variable axis; 500 and 600 have no file of their own, but the
CSS font-matching algorithm doesn't fake them — it picks the nearest
*already-loaded* face instead. Desired weights at or below 500 search downward
first, so `font-medium` (500) resolves onto the real 400 outlines; desired
weights above 500 search upward first, so `font-semibold` (600) resolves onto
the real 700 outlines. `font-normal` and `font-bold` are exact matches. Nothing
is synthesised — see "Synthesised bold" below for why that distinction
matters. 800 is not loaded: nothing in the type scale asks for it, so shipping
it would be dead weight.

**It applies to Arabic and nothing else**, which takes three cooperating pieces.
Getting any one of them wrong makes the swap silently do nothing, which is
exactly what happened on the first attempt:

1. The layout attaches `--font-almarai` to `<html>` **only when the
   locale is `ar`**, so an English document has no declaration naming the family
   and no reason to fetch it.
2. The theme's font stacks lead with **`--script-ui-font` / `--script-display-font`**
   rather than naming a family. This is the part that is easy to get wrong:
   `@theme inline` **inlines** a theme value into every utility it generates, so
   `.font-sans` compiles to the literal stack and *never reads* `--font-sans`.
   Overriding `--font-sans` for Arabic therefore changes nothing. Declaring the
   stack as `var(--script-ui-font), …` is what survives inlining — the `var()`
   rides into the utility and stays resolvable per element.
3. An **unlayered** `:lang(ar)` block swaps those two variables. Unlayered
   matters as much as the indirection: both `:root` blocks are unlayered, and an
   unlayered declaration outranks any layered one, so the same override sitting
   in `@layer base` loses to `:root` every time.

⚠ The Arabic **leading** (`--lh-*`) was declared inside that layered `:lang(ar)`
block and had been losing to `:root` for exactly this reason — Arabic was
rendering with Latin line-heights. It moved to the unlayered block with the
fonts and now applies. `letter-spacing` and `text-transform` deliberately stay
*in* the layer, because unlayered they would outrank the `tracking-*` and case
utilities and no component could override them.

**The two scripts no longer share a display face.** English headings are Readex
Pro; Arabic headings are Almarai. That is deliberate — Arabic is meant
to be Almarai throughout — but it is worth knowing when comparing the two
builds side by side, because it is the one place they diverge by design rather
than by script. Pointing `--script-display-font` back at `--font-readex-pro` in
the `:lang(ar)` block restores the shared display face and changes nothing else.

Each swapped variable keeps an **inner fallback** —
`--script-ui-font: var(--font-almarai, var(--font-ibm-plex-sans-arabic))`
— because `:lang(ar)` also matches an Arabic name or note inside an *English*
page, where step 1 deliberately withholds the family. Without the fallback that
undefined variable would invalidate the whole `font-family` declaration and drop
such text to the system font.

**Check a font swap in the built CSS, not in the source.** The two failure modes
above are both invisible in `globals.css` and obvious in `.next/static/chunks/*.css`:

- `.font-sans{…}` must contain `var(--script-ui-font)`. If it names a family
  directly, `@theme inline` baked it in and no override can reach it.
- the `:lang(ar){…}` doing the swap must sit **outside** every `@layer` block.

⚠ **`preload: false` on that font is load-bearing.** Next emits its
`<link rel="preload">` from the module graph rather than from what a render
actually used, so with preloading on, the English build shipped a preload tag
and every English visitor downloaded the Arabic font. Gating the CSS variable on
the locale does *not* prevent that — only `preload: false` does. If you ever
turn it back on, check the built `en.html` for `Almarai` before shipping.

**The font variables go on `<html>`, not `<body>`.** `globals.css` sets
`font-family` on the html element, and a CSS custom property is only visible to
the element that declares it and its descendants — so variables on `<body>`
leave html resolving to the `system-ui` fallback, which `<body>` then inherits
as an already-computed value. The symptom is subtle: headings look right
(because `font-heading` re-declares the family deeper in the tree, where the
variables exist) while all body text silently renders in the system font.
Form controls are fine either way — Tailwind's preflight gives
`button, input, select, optgroup, textarea` an explicit `font: inherit`.

### The planner's own theme

The weekly planner board is the one screen that sets its own face. `.planner-theme`
(`globals.css`, applied on both `/app/weekly-plans` routes) re-points
`--script-ui-font` and `--script-display-font` at **Tajawal** and cools the four
neutrals it draws with. Everything else in the app is unaffected.

It is scoped that way because the board is not a page of cards — it is a working
grid of thirty-five cells read at 12–14px, and Tajawal's rounder, more open
shapes hold up there better than either body face.

**Tajawal ships no 600.** The family jumps 500 → 700, and the scale bakes 600
into `heading-*` and `label`. That needs no handling: CSS weight matching walks
*upwards* first for any desired weight above 500, so `font-semibold` lands on
the real 700 outlines rather than being synthesised — the same mechanism Neo
Sans Arabic relies on. Only 400/500/700 are loaded.

The board's own hierarchy is three roles, and it is deliberately not the app's:

| Role | Step | Weight |
|---|---|---|
| Content — the dish name | `body-md` (16px) | **500** |
| Chrome — day names | `body-sm` (14px) | **700** |
| Chrome — slot labels | `label` (13px) | 700 (via 600 → 700) |
| Figures — kcal | `body-sm` (14px) | 700, tabular |
| Metadata — time, portion | `caption` (12px) | 400 |

**The content is the largest thing and the lightest.** A dish name is the most
repeated element on the screen, and at bold, thirty-five of them read as a wall;
size carries it instead. The chrome inverts that — small and bold — because a
column header is something you navigate by rather than read. Figures are small
and bold so they stay scannable as data.

⚠ `.planner-theme` is written as **`:root .planner-theme`**. In an Arabic
document the board's own element also matches the unlayered `:lang(ar)` block,
which sets those two font variables to the Neo Sans stack; at equal specificity
the later rule wins and the override would depend on source order. The
descendant selector makes it (0,2,0) against (0,1,0). The Arabic `--lh-*` values
in that block are deliberately **not** overridden — Tajawal needs the looser
Arabic leading exactly as much as Neo Sans does.

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

One set: **Solar Linear** — rounded, open strokes, single weight.

The app was Solar Bold until it had accumulated three separate linear
exceptions (the portal tab bar, the client's meal cards, the client record's
row markers), each argued on the same grounds: a filled glyph beside every
heading turns a page you read into a page of marks. The set is now linear
throughout. The `*Outline` names remain — several are the same glyph as their
unsuffixed twin now, which is harmless.

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
- **The glyph is drawn 12% larger than its box** (`GLYPH_SCALE` in `icon.tsx`).
  Solar's canvas has padding built in that a filled glyph fills out and an open
  stroke does not, so linear icons read a size smaller than bold ones at
  identical dimensions. Scaling the artwork inside the `<svg>` rather than the
  `<svg>` itself fixes that for every call site at once and moves no layout.
- Icons that encode direction (`chevronStart`, `chevronEnd`, `signOut`) mirror
  in RTL automatically. Everything else — clock, chart, checkmark, logo — must
  not, which is why `DIRECTIONAL` in `icon.tsx` is an allowlist.
- `@iconify-json/solar` is a **devDependency**: a build input, never shipped.

## Shape

**Every corner of a surface takes the same radius.** There is no swept or
otherwise singled-out corner, and a component may not introduce one: a shape
that differs on one side reads as pointing at something, and none of these
surfaces are.

| Surface | Radius | Hover | Press |
|---|---|---|---|
| Button, field | 10px | — | 1px sink |
| Card | 16px | 2px ring (interactive only); the header icon fills olive | scale .995 |
| Icon button | `rounded-full` | — | — |
| Bottom nav | 16px | — | — |
| Rail | **none** | — | — |
| Chips, badges | pill | — | — |

**Geometry does not change under the pointer.** A corner that grows on hover
moves the surface while someone is reading it; hover is carried by the ring and
the fill instead.

Badges are a pill and the rail is square on every corner. A rounded box is what
this system gives a control or a surface — a badge is a label, and the rail is
the wall the app hangs on, so neither takes that shape.

Small repeating tiles — the seven day cells in the portal's week strip, for
instance — count as chips, not surfaces: seven swept corners in a row reads as
noise rather than as the Arc.

A card can still lead a screen without being filled with brand colour: the
portal's progress card is an ordinary cream `Card` whose olive sits in the
progress ring and a soft tint behind it. A fully saturated card pulls attention
away from everything around it, which on a screen of five sections is a cost,
not emphasis.

Radius scale otherwise: `sm` 8 · `md` 12 · `lg` 16 · `xl` 24, plus
`--radius-control` (10px) for buttons and fields. **Never `rounded-none`** on a
surface — except `Button variant="link"`, which is a run of text, not a
surface, and a child that deliberately squares off against its container
(`Card variant="listRow"`).

A panel nested inside a card takes a plain radius with no ring and no shadow of
its own. It is part of that card, not a second one.

⚠ **A scroll container clips a card's ring and shadow.** Both are drawn outside
the border box, and setting `overflow-y` to anything but `visible` makes
`overflow-x` compute to `auto` as well — so a card flush against a scrolling
parent loses its edge on whichever side it touches, and reads as a card with a
side missing. The client record's tab body was doing this on all four edges.
Give the scroller a little padding (`px-1 pt-1 pb-6` there — the block-end needs
more, because that is where the last card's shadow lands).

## Scrolling

**No surface in this app draws a scrollbar.** `globals.css` sets
`scrollbar-width: none` on `*` and hides the WebKit bar; everything still
scrolls by wheel, trackpad, touch, keyboard and drag. This replaced a 14px
olive-100 bar styled to match the platform's own track and thumb.

**It is also the fix for scroll-induced layout shift, and the only one needed.**
A classic scrollbar takes its width out of the content box, so a surface that
grows past its container jumped 14px sideways at the instant the bar appeared —
the intake dialog does exactly this when a `field-sizing-content` textarea
expands under typing. A bar with no width cannot move anything, so there is
nothing left to reserve: **do not add `scrollbar-gutter: stable`**, which would
now reserve a gutter of zero and read as dead CSS to the next person.

`*` and not `html`, because `scrollbar-width` is not inherited — the root alone
leaves every nested scroller drawing its own bar.

⚠ **The trade is real and it is now taken everywhere.** A scrollbar is also the
signal that there is more to see, and the only pointer-driven way to move a long
way through it. Two things keep this honest and both are load-bearing: a surface
that can overflow should carry its own affordance — the select's scroll buttons
are the model — and nothing may depend on a visible bar to tell a reader that
content continues. `@utility no-scrollbar` still exists and is now redundant; it
is kept because its call sites (the calendar grid, the dashboard agenda) are
recording something true about themselves.

**A two-column card grid gaps badly when the columns differ in height.** In a
`grid-cols-3` holding `col-span-2` cards beside single-column ones, each pair is
a grid *row*, and a row is as tall as its tallest member — so a short card
leaves a hole beneath it the size of the difference. `items-start` fixes the
card heights and not the rows. Where the two columns are independent stacks,
make them independent: one flex column per side, each with its own `gap`.

## Buttons

Six variants, matching [buttons.png](design-images/buttons.png):

| Variant | Rest | Hover |
|---|---|---|
| `default` | olive-500 fill, white label (**3.47:1 — see below**) | olive-600 (5.46:1) |
| `outline` | white, olive border + label | lime-400 fill, olive-950 label |
| `ghost` | no box, olive label | lime-400 fill, olive-950 label |
| `accent` | lime-400 fill, olive-950 label | lime-300 |
| `destructive` | white, clay border + label (6.84:1) | clay-100 fill (5.81:1) |
| `destructiveGhost` | no box, clay label (6.84:1) | clay-100 fill, label stays clay (5.81:1) |
| `default` + any `icon*` size | olive-50 fill, olive-200 border, olive glyph | olive-100 |

Plus `secondary` (olive-50 tint), `primarySubtle` and `link`, which aren't in
the six but keep dense surfaces off ad-hoc classes.

**`primarySubtle` — the primary, resting.** Olive-100 fill with the olive-700
label (6.51:1), filling to the solid primary and its white label on hover. For
the affirmative action on a card that is itself something you *read* before you
act — a pending request, where a solid olive block makes the loudest thing on
the page the one you are meant to consider first. It is not a weaker `default`:
reach for it only where the card, not the button, is the thing being offered.
Its rest state passes where `default`'s does not; the ⚠ below applies to its
hover.

**`neutral` — a box, a black label, no brand colour.** For a row of peers where
exactly one control is *the* action and the rest are merely available. `outline`
and `ghost` both draw their label in olive, which is the system saying "act on
me"; four of them side by side say it four times and the real primary stops
being findable. `neutral` takes the edge so it still reads as pressable and
gives the colour back to the button that earned it — n-900 on white, 16.64:1.
`aria-pressed` fills it (n-100) rather than tinting it, so a toggle's on-state
never spends the brand colour on a view preference. The planner's toolbar is the
reference case: publish is the decision; "new week", "edit plan" and "compare"
are things you may also do.

**A control that will become available should hold its place.** Rendering it
only once it applies pushes everything after it sideways at the moment the
person is looking elsewhere — the planner's "edit plan" did exactly that on
publish. Render it disabled instead: the row's shape stops changing, and the
greyed control doubles as a note that this unlocks later. Put the explanation on
a *wrapping element*, never on the button — `disabled:pointer-events-none` means
a `title` on the button itself can never be hovered.

**`destructive` vs `destructiveGhost`** is about what the control is *among*,
not how dangerous it is. A destructive action that closes a decision — the
delete inside a confirm dialog — takes the outlined box that says so.
A destructive action sitting among other controls takes the ghost: the portal
header's sign-out sits beside a language switcher, and an outline there read as
one more destination. (The rail's sign-out is no longer a `Button` at all — it
is a `destructive` menu item, which speaks the same clay-at-rest language one
level down.) Both keep the clay label at rest;
neither is ever a solid red block. Like `ghost`, `destructiveGhost` carries 12px
of padding rather than 20px, so a boxless control does not look like it has a
gap around it.

**Asking first is `ConfirmDialog`, never `window.confirm()`.** `ConfirmSubmitButton`
guards a form submit and `ConfirmDialog` guards an arbitrary callback; both draw
the system's own modal. The native prompt was chosen before there was one, and
it is browser chrome pinned to the top-left corner of a right-to-left page, in
the browser's UI language rather than the clinic's, with an OK button styled by
the operating system.

The exchange is asynchronous where `confirm()` blocked, so `ConfirmSubmitButton`
cancels the click unconditionally and confirming starts a *new* submit through
`requestSubmit()` — which dispatches a real submit event, leaving the form's
`action` and `useFormStatus` behaving exactly as they did. **The confirm button
carries the action's own words**, not "OK": it is the last chance to notice you
are on the wrong row. Cancel is first in the DOM so Enter cannot delete
anything. An action that is one click to undo — archive, restore — passes no
message and does not ask at all; prompting on a reversible action only trains
people to dismiss prompts.

⚠ **White on olive-500 is 3.47:1 — under AA's 4.5:1 for a 16px label.** It
clears the 3:1 a graphical mark needs, and the *hover* fill (olive-600) is the
state that passes at 5.46:1, which is backwards: the resting state is the one
that has to be readable. This is a deliberate brand choice and it is what
ships, but it is the system's one knowing text-contrast failure, and it repeats
on every `bg-primary text-primary-foreground` surface — the segmented thumb,
the portal tab bar, the calendar's "today" pip, the plan day strip, the
agenda's focused session.

Two things fix it if it is ever revisited, and only one of them keeps the
lighter green: pair olive-500 with an **olive-950 label** (4.77:1) and make
hover go *lighter* to olive-400 (6.87:1) — which is exactly what `.dark`
already does with this fill. Darkening the fill back to olive-600 is the other
fix, and it is the one that gives up the lighter brand green.

Disabled is the button at 50% opacity — its own fill, border and label, faded.
It is **not** a repaint to the sunken fill: a ghost button has no background,
and giving it one when it is turned off made the disabled state louder than the
enabled one. Opacity is what `Segmented`, `Switch` and the calendar's day cells
already use, so all four now say "unavailable" the same way. The contrast
trade is deliberate and is the standard disabled-control exemption; a disabled
control must never be the only thing carrying a piece of information.

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

**A field has no hover state. Focus is the only thing that moves**, and only
`border-color` ever moves — a field never changes shape, size or position under
the pointer.

- **Hover** — nothing. Fields used to take an olive-50 fill and an olive-500
  edge, which meant a form lit up green wherever the mouse rested and the field
  that was actually focused had to compete with it for attention. A text input
  is not a button: hovering promises nothing that clicking does not deliver.
  `--input-hover` survives as a token because the intake form's option cards are
  genuine targets and still use it.
- **Focus** — the olive-500 edge, **2px thick**. The box is *taken*. Keyed off
  `:focus`, not `:focus-visible`: clicking into a box and seeing nothing change
  is the one case where a mouse user needs what a keyboard user gets.
- That second pixel is **1px border + 1px outline at `outline-offset: -1px`**,
  never `border-width: 2px`. A thicker border keeps the outer box still but
  steals a pixel from the content box, so the text nudges as you click into it;
  an outline sits outside layout and moves nothing. Same colour, so the two read
  as one line.
- **Rest** is the neutral n-500 edge; **read-only** is a sunken fill with no
  border; **disabled** is the sunken fill at 50%.
- Fields deliberately **do not** use the lime focus ring buttons use. A form has
  many fields, and lime firing on every tabbed-to field turns the accent into
  noise. There is no ring and no halo at all — the edge does the whole job.

> Replaced: a 2px olive rule that grew along the block-end edge to 58% of the
> width, plus a 3px olive-100 halo on focus. Both put attention on the frame at
> the moment attention belongs on the cursor, the halo painted outside the
> control and nudged dense forms (the client card carried an inset gutter purely
> to stop it being clipped), and the line was anchored with `background-position`,
> which has no logical keyword — the `:dir(rtl)` rule standing in for it was
> being dropped by Lightning CSS, so it had been growing from the wrong edge in
> Arabic in every production build. **Do not reintroduce a `:dir()` rule here.**
- Wrap a label and its control in `Field` — that's what drives the label's
  colour shift on focus (`:focus-within`) and gives `FieldError` somewhere
  reliable to live.
- **Validate on blur, never per keystroke.** A message that arrives mid-typing
  is describing a half-finished value. Error entrance is an opacity fade, never
  a shake.

### No emphasised field

**A field's resting state is neutral, always.** There was a `.q-field-primary`
— olive-600 edge, olive-50 fill at rest — for marking the answers a record
cannot start without. It is gone, and nothing should replace it: hover now fills
a field olive-50 and focus takes the olive edge, so a field wearing both at rest
was signalling a pointer that wasn't there, and a freshly opened client card was
a block of green before anyone had typed a character.

Mark the essential fields by **showing** them — a form that asks for only what
it needs needs no emphasis at all — or by type and wording. Don't spend a state
the pointer already owns.

### The two client dialogs

A client record is written on **dialogs, never on a page**. Creating and editing
both open over whatever screen asked, a record is edited from the register, from
the record itself, from the calendar's appointment card and from the planner's
context panel, and in none of those is losing your place a reasonable price for
fixing a phone number or recording a weigh-in.

There are two, and the split is by *what kind of fact*, not by how much room is
left:

- **`ClientFormTrigger` — the client card.** Identity: name, email, date of
  birth, phone, sex. Five fields, one column, one width, no disclosure. This is
  what a walk-in is created from.
- **`IntakeFormTrigger` — the intake.** Everything clinical, across both
  `clients` and `client_nutrition_profiles`: measurements, allergies, targets,
  the meal schedule, and what the portal shows. Read on the client's Nutrition
  tab, written here.

⚠ **Don't put a clinical field back on the card.** The card used to carry six of
them behind a "more details" disclosure while the rest lived on a form owned by
the weekly planner. Neither surface held a whole client, the six inputs the
calorie formula needs were split five-and-one across them, and the planner's
"missing fields" banner named fields its own link could not edit. That is what
the disclosure cost, and it is why there is no longer one.

**Its header has no close button.** Escape, a backdrop click and the footer's
own Cancel all close it already; a third exit only crowds the corner the title
starts from. `DialogHeader` renders the X only when given `onClose` — pass it
where a dialog has no footer to leave by.

### A popup inside a dialog needs both halves

A dialog is a native `<dialog>` opened with `showModal()`, which the browser
promotes to the **top layer**. Any popup opened from inside one has to do two
separate things, and doing only the first is the trap — the popup works,
positions correctly, and is still wrong.

1. **Portal into the dialog, not into `body`.** A `document.body` portal is not
   in the top layer, so it paints *behind* the open dialog at any z-index.
   `useDialogContainer()` publishes the element to portal into; it returns
   `null` outside a dialog, where Base UI's own `body` default is right.
2. **Position `fixed`, not `absolute`.** Portalling into the dialog also makes
   the popup a *child* of it, and a `<dialog>` scrolls its own overflow — so an
   absolutely positioned popup takes the dialog as its containing block and is
   clipped at its edge. The phone field's 240-country list was cut off part-way
   down with no way to reach the rest. A fixed popup's containing block is the
   viewport, so the dialog's clip no longer applies, and Base UI measures the
   anchor with `getBoundingClientRect` either way.

Pair (2) with `max-h-(--available-height)` rather than a flat `max-h-*`: the
positioner reports the room it actually found, so the list is capped by the
viewport instead of by a guess that can still overrun a short window.

`popover.tsx`, `combobox.tsx`, `select.tsx` and `phone-field.tsx` all do both.

`Select` is a real native `<select>` with `appearance: none` and our own
chevron — Chrome pins its built-in arrow to the border and ignores
`padding-inline-end`, so long option text collides with it. Keyboard
behaviour, screen-reader semantics and the mobile picker still come free.

### One time control

**`TimeInput`** — the browser's own segmented time field, with a clock leading
it. It is the only time control; a meal time and a clinic's opening hour are the
same control with a different `step`.

> Replaced: `TimeField` (an hour list beside a minute list) and `TimeSelect`
> (one list of whole times). Between them they meant a meal time was two
> dropdowns you assembled yourself, and the code carried two components, two
> option-generating loops and two off-grid-value policies for one kind of
> answer.

This section used to open "neither is `<input type="time">`", and the reasoning
was not wrong — so be precise about what changed:

- **The OS popup is gone**, which was the loudest objection: Chrome's
  three-column spinner is drawn in the operating system's own type and reads as
  a foreign object dropped into an Arabic page. Hiding
  `::-webkit-calendar-picker-indicator` removes the button that summons it and
  leaves the segmented field, which is drawn in the page's own type.
- **The 12-hour concern stands, and it is the browser's call.** A time input
  formats to the *browser's* locale, not the page's, so a clinic working in 24
  can still be shown `08:30 AM` by a browser set to US English. The submitted
  value is always 24-hour `HH:MM`, which is what `timeOfDaySchema` parses, so
  this is a display difference and not a data one. If it ever has to be
  controlled, that is the thing to solve — not the control.

**`step` is in seconds, and it must match whatever validates the value.** A
quarter hour is `900`, not `15`. Pass it where the form validates to a grid: the
browser snaps its stepper and reports a typed off-grid value as invalid, instead
of accepting it and letting the server reject it. A control that offers a time
its own form refuses is a trap the reader walks into once per visit, and that
rule outlived the two components it was written for. Never pass `1` — it adds a
seconds segment, and nothing here stores a time more precisely than the minute.

**It is an LTR island in both scripts**, like the phone field. `dir="ltr"` goes
on the wrapper and not on the input: the glyph is placed with a logical
`start-0` and the box clears it with a logical `ps-12`, so setting the direction
one level in resolves those two against opposite edges and drops the clock on
top of the digits.

**Where the same value repeats down a list, offer to copy it.** Most clinics
work the same hours every day, and the schedule made you say so seven times.
One `neutral` button copying the first open day's hours across the rest turns
the normal case from twenty actions into three — and it is `neutral` rather
than `outline` precisely because Save is the decision on that card and only one
control should be wearing olive.

## Cards

Anatomy: `CardHeader` (title + optional `CardAction` marker) · `CardContent` ·
optional `CardDivider` · `CardFooter` (metadata inline-start, action
inline-end).

Variants: `default` · `tinted` · `empty` (dashed olive-300, for empty states) ·
`listRow` (square and unshadowed; the last row of a group rounds its block-end
corners so the stack ends flush with its container) · `tile` (a rounded muted
surface with its own padding, for an item inside a card that is a separate
thing you act on — no ring, no shadow, per the nesting rule above) ·
`archived`.

Props: `size="sm"`, `interactive`, `selected` (the olive ring thickens; the card
does not change colour), `flagged` (a clay dot in the corner — never a red
card). `CardTitle` takes an `icon` — a plain glyph beside the title, never a
badge.

**`CardTitle` renders a `div` unless you ask for a heading.** Pass
`as="h2"` (or `h3`) where the card genuinely is a *section* of the page; the
visual scale does not change, only the semantics. The default stays `div`
because a card title is often a label rather than a section head, and promoting
all twenty-odd call sites at once would invent a heading outline nobody
designed. Where a screen is a stack of cards, promote them: the client record
had one heading across five tabs — the client's name — so the Nutrition tab
presented six unlabelled regions to a screen reader with no way to jump between
them.

**A card answers the pointer with its icon, and only a clickable one also gets
an edge.** A header icon drawn on a disc fills olive with its glyph inverting
to white (`group-hover/card:bg-primary group-hover/card:text-primary-foreground`);
a bare `CardTitle` glyph, which has no disc to fill, goes olive instead
(`group-hover/card:text-primary`). On an `interactive` card that runs alongside
the edge below; on a card that is not `interactive` it is the whole response —
a surface you cannot click has no business promising otherwise.

**A read-only panel may answer with nothing at all**, and a hand-rolled header
disc should drop the hover classes when it does. The dashboard's register and
its two charts are the case: they are not targets, nothing inside them is
clicked through the header, and a disc lighting up there read as a promise the
card could not keep.

**`interactive` colours the edge, it does not lift or thicken it.** On hover the
hairline stays 1px and turns olive; there is no shadow change. A raised shadow
reads as the card leaving the page, and on a grid of peers — the dashboard's
quick actions — that makes the hovered one look like it belongs to a different
layer; a 2px ring grows into the gap between tiles and makes the row read as
jumpy. Colour alone says "this one" while the card stays put, and it is the same
language `selected` already speaks: the edge, never the fill. `selected` keeps
its 2px ring, because a persistent state outranks a transient one. The
**geometry does not change** with it: a corner that moves under the pointer
shifts the card while you are reading it. It stays opt-in, because a card that
answers the pointer is promising it does something when clicked.

`CardSkeleton` is the loading state: same shape, same footprint, nothing jumps.

## Avatar

`Avatar` draws a person's initials on their stored colour — the calendar's
client picker, the dashboard agenda and the top-clients list all use it, so
one person looks the same everywhere. Sizes `sm` · `default` · `lg`.

It is a **circle**: the rounded box is the shape this system gives controls and
surfaces, and a person is neither. The `color` prop is per-record data, not a token (see
"Arbitrary colour" below), which is why it arrives as an inline style. It
renders `aria-hidden` — the name it stands for is always beside it.

## Tables

**The header strip is a rounded bar**, not a full-bleed band: the control radius
(10px) on all four corners, applied to the first and last `th` on their *logical*
sides so Arabic mirrors it for free. It has to go on the end cells rather than on
the `thead` — a table's fill is painted per cell, and square cells sitting on a
rounded group clip the corners straight back off. `Table` is
`border-separate border-spacing-0` for the same reason: the collapsed border
model drops `border-radius` on everything inside a table. Nothing else changes,
because only `TableRow` draws an edge and only on its block-start side, so there
was never a border for the collapsing model to merge.

The dashboard's register card draws the same strip by hand — it is a `div` of
three columns, not a `<table>` — so it carries the radius itself. Change one and
change the other; they are meant to be the same bar.

`TableRoot` owns the scroll container and the frame's radius; `Table`, `TableHeader`,
`TableRow`, `TableHead`, `TableCell` and `TableEmpty` are the rest. Cells
default to `text-start`; pass `numeric` for anything that must stay LTR inside
Arabic — figures, times, IDs, units.

**`numeric` sets `dir="ltr"` on the cell, which also re-resolves `text-start`
against the cell rather than the page** — so in Arabic a `numeric` column
flushes left while every column beside it flushes right. That is correct for a
figures column you are also aligning with `text-end` (see `dish-table`), and
wrong for a value that simply happens to be Latin. When you want the *value*
in LTR but the *column* to follow the page, leave `numeric` off and isolate the
value instead: `<span dir="ltr">{value}</span>`, with `tabular` on the cell if
it is digits. The register's phone and email columns do exactly this.

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

## Callout

`Callout` — a short statement the reader has to notice, on a tinted surface.
One shape, three tones, each bringing the glyph that pairs with its status
token: `neutral` (sunken, `info`) for a fact worth saying out loud, `attention`
(amber, `attention`) for something someone has to act on, `medical` (clay,
`medical`) for a real allergy or condition. `icon` overrides the glyph where the
subject is more specific than the tone — the portal's WhatsApp notice is neutral
and takes the WhatsApp mark.

**There is no `success` tone**, for the same reason there is no green-means-go
colour, and a callout that only confirms is usually one that could be deleted.

It exists because four notices were being hand-rolled across two tabs of the
client record with four different paddings, radii and text sizes, two of them
with no glyph at all.

## Figures

`StatTile`, inside a `StatGrid` — a label, a tabular figure, its unit, and an
optional note. The grid is a hairline lattice rather than gapped cards, so a
column of readings scans as a table instead of as tiles.

**Every figure in a grid is the same size and shares a baseline**, which is the
whole point: the Nutrition tab was setting numeric facts at `heading-sm` with a
12px unit beside them and non-numeric facts at `body-sm` in the same grid, so
one row held three type sizes and nothing lined up with anything. `flagged`
draws a figure in amber — a reading to check, never clay, which is reserved for
medical facts. An absent value renders at body size, because an absence is not
a reading and setting "—" at 24px gives a missing number the weight of one.

**The tile is centred, and the figure is `heading-sm`.** Both changed together.
Start-aligned, each reading hung off the inline-start edge and the unit trailing
the figure pulled every optical centre a different distance from the label above
it; centred, the label sits over its own figure and six tiles scan across as one
row. The step down from `heading-lg` is about the screen, not the tile: 24px is
what the client's *name* is set at in the record header, and a height reading
has no business matching the person it belongs to.

**A tile is a label and a figure.** The `note` slot exists for provenance a
reader cannot otherwise recover — "saved with the plan" — and it is easy to
overspend: the Nutrition tab had one on five of six tiles ("محسوب", "مقترح",
"فوق النطاق الصحي"), and the last of those restated in words the comfort band
drawn directly beneath it. If the thing under the figure is already on screen,
it is not a note.

The record header's fact strip is deliberately **not** `StatGrid`: the same
rules and tabular figures one step down, because a header must not compete with
the name above it.

## Copy

`CopyButton` — an icon-only ghost control that writes one value to the
clipboard, swaps to a check for 1.6s and announces through a `role="status"`
live region. No toast: the system has none, and inventing one for "yes, that
worked" is a lot of furniture for a message with no consequence.

A denied clipboard permission fails **silently** — the value is still on screen
and still selectable, which is exactly the behaviour that existed before the
button did. The one-time portal password is the case that earns this: it is
shown once, never stored in plaintext, and asking someone to carefully select
the only unrecoverable value on the page is a poor trade.

## Navigation

Matching [Navigation.png](design-images/Navigation.png).

**Rail** (`Sidebar`) — a near-white **#F9FAFB** column, full-bleed, separated
from the page by a 1px olive-300 `border-e`. **It is not a card**: no radius, no
elevation. It has been a solid olive-900 inset panel and then a pale olive-50
one; the dark panel made navigation the heaviest thing on every screen, and the
olive one became the only tinted furniture once the canvas went white, which
read as a coloured band rather than as a wall. #F9FAFB is the system's one cool
grey, and it is deliberate.

**The divider is load-bearing.** #F9FAFB against the white canvas measures
1.02:1, so the line is not reinforcing the boundary, it *is* the boundary, and
it has to survive being drawn between two near-whites. It is **#D1D5DB**, the
darkest of the rail's three greys, at 1.47:1 against the canvas. It was
olive-300 (1.68:1) — firmer, but the last olive left in the shell furniture once
the rail went grey, one green line with nothing near it to belong to. If it ever
reads too soft, go a step darker in the same cool family; don't go back to a
tint.

Every item has an icon; nine text-only rows are hard to scan. Idle rows are a
neutral **n-700** glyph (`--sidebar-icon`) beside an olive-800 label on no
surface at all — the glyph is what you scan a rail by, and a neutral one reads
as a wayfinding mark rather than as brand.

**The active item is the only olive thing on the rail**: an olive-50 surface
with an olive-500 label and glyph. On the pale olive rail the active item was
the *darkest* thing on it, because a tint could not out-mark a tinted rail; a
rail with no colour of its own singles an item out with tint alone, and a dark
block would interrupt a column of quiet rows. There is no lime leaf node any
more — the tint is the mark, and the leaf was a second, louder one competing
with it.

⚠ **olive-500 on olive-50 measures 2.95:1**, under the 4.5:1 a 16px label needs
and the 3:1 a glyph needs. It is the specified design, so it is what ships, and
`font-semibold` plus `aria-current="page"` carry the state for anyone the colour
fails — but it is the one row on the rail that does not meet contrast. olive-600
on the same surface measures 5.09:1 and is a one-token fix.

Hover (`--sidebar-hover`, #F3F4F6) stays a **neutral** one step down from the
rail, never a tint: the active surface is olive-50, and an olive hover under it
would either outrank the state it sits below or be mistaken for it.

**The rail's focus ring is olive-950, not the global lime `--ring`.** Lime
measured 9.77:1 on the old dark rail and 1.28:1 on this one. Buttons get away
with a lime ring because they pair it with an olive-950 halo; the rail has one
ring and no halo, so the ring itself has to carry the contrast — 15.86:1 on the
rail and 15.42:1 on the active item's olive-50 surface.

**The rail can end in a profile menu** (`SidebarProfile`, given `user`): one row
carrying the signed-in name over a muted email, with the avatar leading and a
stacked chevron pair closing it. It sits in the footer, fenced off with a
hairline. The dietitian area has no app bar, so this is where account controls
live.

**It is a `DropdownMenu`**, the same primitive as the row actions and the
selects. It used to be a hand-rolled disclosure that grew *inside* the rail — a
`0fr` → `1fr` grid row, with the panel rendered before the trigger so it opened
upward. That worked until the rail collapsed to 56px, where there is nothing to
grow into, and it never had type-ahead, arrow keys, a focus trap or a return of
focus to the trigger. A menu positions against the *viewport* instead: it opens
**inline-end** on a desktop — out over the page, away from the rail, in either
script — and **upward from the bottom** on a phone, where the rail is a sheet
with no side to open into.

Inside, block-start to block-end: the identity again (the trigger is behind a
sheet on a phone, and a bare avatar when collapsed — either way the menu has to
say whose account it is about to sign out), then **settings, WhatsApp,
security**, then the **language** radio pair, then **sign-out**. The three
destinations are *not* in the rail's own nav — the same link in two lists is two
answers to "where does this live" — and sign-out is last, furthest from them,
as the one item a mis-aimed click most wants to miss. It is the menu's
`destructive` variant: clay label and glyph, clay fill on focus. Settings takes
a **gear**, not the person glyph the old rail's Profile item used — it is
reached from a control that is already a person.

**Language is two radio items under a label**, not the `group` segmented
switcher (`LocaleSwitcher variant="menu"`). A boxed chip inside a panel of menu
rows was the one thing in it that was neither a destination nor an action; as
radio items it is the same choice in the shape everything around it has, and the
check mark states which is live without a fill having to out-shout the row above
it. The endonyms show here, and so does `lang` — the `AR`/`EN` codes exist only
because the `group` variant has to fit two locales into 40px.

**Sign-out's form lives outside the popup.** Choosing a menu item closes the
menu, and a form that unmounts in the same tick as its own submit is a race; the
item calls `requestSubmit()` on a hidden form in the footer, which stays mounted.

**The trigger carries no `tooltip`.** A tooltip wraps its button in a trigger of
its own, and a button that is already a menu's trigger cannot also be a
tooltip's — the hover label wins and the menu never opens. Collapsed, the menu
names the account at its own head instead.

The portal omits `user` and gets no menu, because it still has a header carrying
sign-out and the language switcher — and below `md`, where the rail is hidden,
that header is the only place a client can reach either.

**App bar** (`Header`) — **the portal only.** The dietitian area has no bar: it
carried a title the rail already said, a name, and a notification bell, and the
row it cost is worth more than all three. The name and everything that hung off
it moved into the rail's profile menu; the bell's feed became a page
(`/app/notifications`) reached from that menu, because a list with a scrollbar,
links out of every row and an empty state is a page, not a popover. Each staff
page owns its own heading, and that heading is the page's `h1`.

Where it does appear it is deliberately **unfilled**: no background, no border,
no elevation. The page's own cards carry the weight; the bar carries itself on
type and spacing. `children` sits beside the title for page-level controls.

**Everything in the bar is 40px** — the one place the pointer-only `sm` size is
for: sign-out is `sm`, and `LocaleSwitcher` is pinned to `h-10` to match.

**The locale switcher appears once per screen** — inside the rail's profile
menu, in the portal's bar, or on the login screens, which have neither. There is
no floating copy pinned to a corner.

It is labelled **`AR` / `EN`**, not with endonyms: it is 40px of a rail's width,
and two endonyms in two scripts never fit without one truncating, while the ISO
codes are the same two characters in both locales so the control stops changing
width when the language does. The endonym moves to `aria-label`, and the button
carries **no `lang`** — tagging Latin `AR` as Arabic tells a screen reader to
pronounce it in the wrong language.

**Its selected chip is neutral (n-100), not olive.** Olive marks what you can
act on; the selected locale is a state, and in the profile menu an olive chip
was the one brand-coloured thing in the panel, pulling the eye to the least
consequential control in it.

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
visible. The track is `rounded-lg` and the thumb `rounded-md`, so the thumb
reads as sitting inside the track rather than as a second track.
`role` is a prop: the calendar's day/week/month switch is a `tablist`
(same page, different view), the login role switch is a `radiogroup` (different
form). Identical visually, different to a screen reader.

**Tabs** (`Tabs` + `tabLinkVariants` + `TabBadge`) — link tabs, for when each
option is an **address**. Square, with a 2px olive underline on the active one
and its label in olive-700 (7.37:1); the rail's active row is olive-500 on
olive-50 at 2.95:1, and the tabs deliberately do not repeat that. No radius: a
tab's block-end edge is the container's own hairline, and rounding only the
block-start corners would single out a side.

**`TabBadge` is a bare numeral, not a pill.** It was a filled chip, which is the
shape reserved for a *state* — and a count of unfilled fields is a quantity. See
"A badge is a state" under Colour: the client record was wearing enough of them
that none of them registered. The digit carries the whole message at a third of
the ink, and still inherits the tab's active colour so it never looks like it
belongs to the label beside it.

**Segmented is not the control for routes.** A boxed switch promises "a view of
this page"; five of them promising pages cost the client record middle-click,
Cmd-click, open-in-new-tab, a URL in the status bar and working before
hydration — and, because `Segmented` is `inline-flex`, a `flex-col` parent
stretched it to the full page width and left the tabs hugging one edge of empty
bordered space. `Tabs` imports nothing from `@/i18n/navigation`; call sites pair
`tabLinkVariants` with their own `Link`, the way they already pair
`buttonVariants` with one.

Staff and portal share `Sidebar`. The portal passes icons (`PORTAL_NAV_ICONS`,
the same glyphs as its bottom bar); the staff rail is text-only.

**The rail's metrics, and where they leave the registry.** Rows are **40px**
high (`h-10`) with a **6px** gap between them and a **20px** glyph, on a
**256px** expanded / **56px** collapsed column. The registry ships 32px rows,
no gap and 16px glyphs in a 48px collapsed rail — dense enough to read as a
list of settings rather than as the five places a working day is spent, and a
16px glyph is too little to aim at or tell apart once the labels are gone.
Collapsed, a 40px button in a 56px column leaves 8px of air on each side, which
is where the extra half-rem of width goes.

Two colour departures from the registry, both from this document. **Hover is
`--sidebar-hover`, not `--sidebar-accent`**: the registry uses one token for
both, which would paint a hovered row in the exact olive-50 of the *active* one
and make the rail appear to change page under the pointer. And **the idle glyph
is `--sidebar-icon`**, the warm neutral, with the active row overriding it —
olive on olive-50 is the whole of how that state is marked.

`Icon` ships `size-4` in its own class list, so the button's
`[&_svg:not([class*='size-'])]:size-5` default never reaches it. Rail glyphs
pass `className="size-5"` explicitly.

## Spacing, shadows, motion

- Spacing is Tailwind's 4px scale. Card padding is `--card-spacing`, 16px
  mobile / 20px desktop.
- **A capped page column hangs from the inline-start, never centred.** The staff
  shell is a rail plus a full-width `main`, and the dashboard and the register
  both run edge to edge — so `mx-auto max-w-3xl` put three screens (profile,
  notifications, requests) in a 400px band of nothing beside the rail, with
  their `h1` indented from an edge every other page starts at. Cap the measure
  and use `me-auto`: the slack all falls on the far side, where the page ends
  anyway. Centring is right where there is no rail to be detached from — the
  onboarding wizard and the auth screens.
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
- One easing curve for every drawing animation, `--ease-sweep`:
  `cubic-bezier(.2,.6,.2,1)`. Durations are named: `--duration-arc` 220ms
  (field focus line, node travel) · `--duration-sweep` 200ms (general reveal —
  a disclosure chevron, a panel opening) · `--duration-label` 180ms ·
  `--duration-reverse` 140ms (anything reversing on blur) ·
  `--duration-travel` 420ms (**a whole surface crossing the screen** — only the
  auth card being replaced by the other role's card). Don't invent a new curve,
  and don't reach for `travel` for something moving *inside* a surface: every
  other step is tuned to that, and the auth card's own two halves swap sides on
  `--duration-arc`, because that is a control changing state and should feel
  like one. The screen's width is what earns the longer time.
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
  RTL text. `Table`'s `numeric` prop does this for a whole column, `<span
  dir="ltr">` for one value — and the difference matters, because the column
  form also pins that column's alignment. See "Tables".
- Progress fills, sliders and comfort bands originate from the **inline-start**
  edge.

**The auth card is the app's only direction lock**, in two places, and both are
about the same thing: the language control must not move the furniture.

- **The card's split.** `dir="ltr"` on the flex row, so sign-in keeps the form
  on the right and sign-up keeps it on the left in both languages. Swapping
  those two halves is the card's one gesture; mirroring the split with the page
  turned two states into four and spent that gesture on someone who had only
  asked for different words. Each half hands the document direction straight
  back (`dir={getLocaleDirection(locale)}`), so **only the geometry is pinned**
  — every label, field, placeholder and glyph inside still reads and aligns per
  locale.
- **The language row itself.** A `dir="ltr"` wrapper around the switcher, so the
  control, its chevron and its open menu stay on the same side. It is what
  *causes* the flip, and a switcher that jumps to the opposite corner the moment
  you use it reads as the page having moved rather than the language having
  changed — you lose the thing you just clicked.

Both are a locked `dir`, **not** a physical inset: `justify-end` and the
`translate-x` pairs inside still resolve against the locked row, so no `right-*`
is involved and `eslint-rules/logical-properties.mjs` stays absolute. **Don't
add a third**, and don't reach for this to fix a layout that merely looks wrong
mirrored — that is a bug in the layout.

## Arbitrary colour, not a token

A practitioner's colour and the palette it comes from
(`src/lib/avatar-color.ts`) store a genuinely arbitrary hex per record. These
were never meant to come from the brand palette — they exist so people are
distinguishable from one another. That's why the no-raw-hex rule is scoped to
`.tsx`/`.jsx`: those values live in `.ts` data files.

**A patient is not one of them.** Their colour is a hue derived from their
position in the clinic — `patientToneStyle` in
`src/features/booking/patient-color.ts`, drawn through the `.patient-tone` ramp
— so it is unique per client, defined in both themes, and the same on every
surface that shows them: the register, the record header, both client pickers,
the planner rail, and every appointment block. Wrap the element in
`.patient-tone` with that style and read `--tone-fill` / `--tone-edge` /
`--tone-mark`; never colour a patient from a stored hex. `clients.color` is the
old stored hex and is legacy — see the note on the column.

A **brand** colour hardcoded in a component is a bug. Replace it with the
token; don't add it to this exemption.

The one deliberate exception in markup is the WhatsApp QR code, which pins
itself to true white (`--n-0`) for scanner contrast rather than trusting
whatever the canvas is. The canvas *is* `--n-0` now, so the two match — leave
the pin in place anyway; the QR's requirement is absolute and the canvas is a
design decision that has already changed twice.

## Charts

**No chart is olive, with one scoped exception.** Olive is the action colour,
and a dashboard whose bars, donut, tiles and buttons were all the same green had
no way left to show which of those you could click. Charts are drawn in the warm
neutral ramp and the two support hues; the brand shows up on the controls around
them. The exception is `viz-brand` — see the note under the table below.

Three scales, each doing one job. All of them are tokens — a hex in a chart
component is the same bug it is anywhere else.

| Scale | Tokens | Job |
|---|---|---|
| Sequential | `viz-seq-1`…`5` | **magnitude** — one hue, five monotone steps, light → dark |
| Categorical | `viz-cat-1`, `viz-cat-2` | **identity** — which segment |
| Neutral | `viz-cat-none` | "not recorded" — an absence, never a third category |
| Comfort band | `viz-band-range` / `-edge` / `-marker` | the three-stop band the brand defines |
| Brand | `viz-brand`, `viz-brand-soft` | **the dashboard's two stat cards, and nothing else** |

**`viz-brand` is the exception to the rule at the top of this section, and it
is scoped to two components.** The dashboard's client-intake and appointment
cards (`src/features/dashboard/components/stat-charts.tsx`) draw in the clinic's
green on purpose. It works there because the plot *is* the card — nothing inside
it is clickable, and the card's one target is a glyph in the corner that no bar
could be mistaken for. It stops working the moment a third surface borrows it,
which is the state the neutral ramps exist to prevent. `viz-brand` is olive-500,
the lightest green that clears the 3:1 mark floor on white; `viz-brand-soft` is
olive-300 and is only legal beside a `viz-brand` mark of the same series.

**`ComfortBand` is for a value against a *tolerance*, not against a set of
categories.** It draws one highlighted span and a marker, so whatever that span
covers is the loudest thing on the track — correct for "today's calories against
the target", wrong for anything with named bands. The client record's BMI scale
used it and therefore highlighted the healthy range permanently: a client at BMI
51.9 got a lime "normal" band and a 3px tick clamped against the far edge, so
the chart answered "where is normal?" when the question was "where is this
person?".

A categorical scale draws every band and fills **the one the value is in**, in
that band's own status colour, with its label emphasised to match. Take the
boundaries from the same function that classifies the value — the same scale had
four bands for the five `BMI_CATEGORIES`, so everything above 30 was labelled
"obese" and `severely_obese` could not be shown at all.

The steps were picked by running the palette validator, not by eye:

- **Sequential is n-400…800, not 200…600.** The light end has to stay visible
  on the card, and n-200 measures 1.34:1 on white, n-300 1.66:1 — both under
  the 2:1 floor a filled mark needs. n-400 is 2.50:1. `.dark` re-anchors the
  ramp (n-600 → n-200) rather than flipping it automatically.
- **Categorical is olive-800 + olive-500.** The only categorical split the app
  draws is the sex donut, and nothing on that card is clickable — so olive
  there cannot be mistaken for an action, and the warm support hues it used to
  take (clay + amber) read as an alarm about the register rather than a
  description of it. Separation is by **lightness**, not hue — 10.4:1 and
  3.47:1 on white, a 3.0:1 ratio between the two fills — which is exactly what
  carries a one-hue pair through colour-vision simulation. Both clear the 3:1
  mark floor unaided.
- **This is the one place olive is data, and it does not generalise.** Olive
  marks what you can act on; the exception holds only because that card has
  nothing to act on. A categorical chart's legend stays mandatory — the fills
  name nothing on their own — and no other surface may borrow the `viz-cat-*`
  tokens.
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
autocomplete, date picker with Hijri/Gregorian toggle, time picker,
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
