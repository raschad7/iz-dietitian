# Weekly Plans Redesign — Design

Date: 2026-08-03
Branch: `weekly-plans-redesign`

## Purpose

The weekly plans board works. It reads badly.

Everything the feature can do is reachable, and the data layer behind it is
sound — one server query feeds the whole board, so switching days and opening
cards costs nothing. The problems are all presentational, and they compound:
type below the system's own minimum, controls below the system's own minimum
size, and 175 of those controls on screen at once. The result is a screen that
looks like a spreadsheet of numbers rather than a week of food.

Three things follow from that:

- **The board is unreadable at a glance.** Dish names render at 11px, five
  buttons sit on every one of the 35 cards, and calorie drift is only knowable
  by reading and comparing seven pairs of numbers.
- **The furniture costs more than it earns.** The client rail holds 224px
  permanently to show a list that is usually short and rarely changes, squeezing
  the seven day columns it sits beside.
- **Starting a week is hidden in a dropdown.** The three ways into a plan —
  generate, copy, empty — are the feature's most consequential choice and they
  live in a 288px menu, with the generate path handing off to a form in a
  different panel.

This design fixes the presentation, restructures the shell around a searchable
client picker, promotes the three doors into a dialog, and gives the feature a
layout that survives below 1280px.

No database schema changes. No changes to generation, nutrition maths, or the
editor's mutation layer.

## Scope

In:

- Design-system compliance across the feature: the type scale, control sizes,
  the icon set, and the shared `Card` / `Button` primitives.
- Moving per-card editing controls into the meal detail panel.
- A calorie meter per day column.
- Replacing `ClientRail` with a searchable client picker in the header.
- A new-week dialog carrying all three doors, absorbing `GenerateForm`.
- Redesigning the three rail panels: client context, dish catalog, plan history.
- Rebuilding the board header and removing the duplicated history navigation.
- Three responsive layouts, down to phone width.
- A new `Combobox` in `src/components/ui/`.

Out (deliberately):

- **Named plans.** The reference mockup shows plans titled `خطة التنشيف` and
  `الأسبوع الأول الأساسي`. Plans have no name column — only `weekStartDate` and
  `status`. Adding one is a schema change and a separate piece of work; rows in
  the dialog read as week date ranges.
- **Copy counts.** The mockup shows `تم الاستخدام ٤ مرات`. Nothing records how
  often a plan has been copied. Not invented here.
- **A "clients without a plan" overview.** Explicitly declined: the picker's
  status badges are the answer.
- Any change to generation prompts, `nutrition.ts`, `targets.ts`, `similar.ts`,
  or `editor-mutations.ts`.
- Drag-and-drop on touch. See [Known risks](#known-risks).

## 1. Design-system compliance

The feature currently violates four documented rules in
[`docs/design-system.md`](../../design-system.md).

**Arbitrary type sizes.** Fifteen occurrences of `text-[10px]` / `text-[11px]`
across the feature's components. The scale forbids arbitrary sizes outright, and
`text-caption` (12px) is the floor for anything a reader does not need.
Replacements:

| Content | Token |
|---|---|
| Meal label, time of day, helper text | `text-caption` |
| Dish name on a card | `text-body-sm` at weight 500 |
| Calorie figures, servings, badges | `text-label` |
| Day name in a column header | `text-body-sm` at weight 500 |

**Controls below 40px.** The meal card's `− + × 🗑 ⠿` row gives roughly 16px
targets; `AddMeal`'s inputs are `h-7` and its buttons `h-6`; the dish catalog's
search is `h-8`; `GenerateForm`'s inputs are `h-8`. The button spec has nothing
below 40px (`sm`, pointer-only). Every one of these becomes a real `Button` or
`Input` at spec size — which is only possible because section 2 moves most of
them off the cards.

**Typed characters instead of icons.** `⠿`, `×`, `🗑`, `−`, `+`, `⟲`, `←` are
literal glyphs. They become `Icon` entries from the Solar Bold set. New names go
into `ICONS` in [`scripts/generate-icons.ts`](../../../scripts/generate-icons.ts)
and are generated with `bun run icons:generate` — the role-not-picture naming
rule applies (`dragHandle`, not `grip`).

**Hand-rolled surfaces.** Meal cards, catalog rows, history rows and swap
buttons each draw their own `rounded-md border border-border` box. All become
`Card`, which is where the corner sweep comes from. `SwapSubmit`'s raw `<button>`
becomes a `Button`.

## 2. The meal card

At rest a card carries information only. It shows the meal label and time, the
dish name, one calorie figure, and the serving multiplier as a chip when it is
not 1.

**One number, not two.** The card shows what the meal actually is — `506` — and
not `506 / 500`. A slot's budget is the same five figures repeated down every
column, so printing it 35 times spends a third of each card's text on a constant.
It stays readable in the rail's schedule table, in the meal detail panel, and on
the card's `title`.

**Two signals when a meal misses.** Past the existing 15% tolerance the figure
turns `status-attention` amber *and* takes a direction arrow — `↑ 870` when the
meal overshoots its share, `↓ 520` when it undershoots. Colour alone would be
the only mark that a meal is wrong, which fails any reader who cannot separate
amber from body text; the arrow carries the same meaning in shape. Dropping the
budget from the card is what makes the second signal necessary.

Cards are equal-sized and their rows align across the week — see
[The board grid](#the-board-grid).

Everything pressable moves off it:

- **Servings, clear, and remove** move into `MealDetailPanel`, which already
  opens on card click and already shows portion, ingredients, nutrients, the
  model's reasoning, alternatives and similar dishes. It gains a portion stepper
  (replacing today's read-only `Portion` section) and a destructive pair at the
  bottom.
- **The drag handle** stays on the card but appears on hover only, positioned
  absolutely so revealing it causes no reflow. Dragging is pointer-only by
  nature, so nothing is lost by hiding it from the resting state.

This is the trade the redesign is built on: adjusting a portion becomes *click
the card, press +* instead of hitting a 16px target directly. One extra click
buys a board that can be read and a control that can be hit. The click was
already the gesture for opening a meal, so the path is not new.

The card keeps its `useDroppable` and `useDraggable` wiring unchanged — only the
control chrome moves.

### The board grid

Cards are currently sized by their own content, so a column holding
`دجاج مشوي مع أرز وسلطة` is taller than one holding `عنب`, and nothing lines up
across the week. Seven ragged columns is most of why the board reads as
disorganised even after the type is fixed.

The week becomes **one grid** — seven columns and eight rows (day header, five
meal rows, the add-meal row) — and each day column is a `subgrid` inheriting
those rows rather than laying out its own. Three things follow:

- Every card in a row is the same height.
- The rows run straight across the week, so `فطور` aligns with `فطور`.
- Meal rows are `minmax(96px, 1fr)`, which distributes free space equally, so a
  short week does not leave the columns stubby at the top of an empty board.

Inside a card, the dish name flexes and the calorie footer is pinned to the
block-end edge, so every figure in a row shares a baseline. Dish names clamp to
two lines — without it, one long name sets the height of all 35 cards.

Subgrid is used rather than flattening the day columns into direct grid children
because the per-day grouping is real: it carries the drop target, the day's
regenerate control, and the reading order a screen reader needs.

## 3. Shell layout

`ClientRail` is deleted. Both routes that render it change.

**The picker.** A searchable combobox replaces the rail, sitting in the board
header. Each row carries the same three facts the rail did: the client's stored
colour as a dot, the full name, and a status badge (`منشورة` / `مسودة` /
`لا يوجد ملف`, or no badge when there is no plan at all). Selecting a client
navigates to `/app/weekly-plans/[clientId]` — still a real URL, so back, forward
and bookmarks keep working, and the page stays server-rendered.

**`src/components/ui/` has no combobox.** `select.tsx` is a native `<select>`,
which cannot filter. The design system lists autocomplete under "not built yet".
So this is a new shared component — `Combobox` — built to the field spec (48px,
`.q-field`, the olive focus arc, logical properties throughout), not a one-off
inside the feature folder. It is keyboard-navigable (`↑` `↓` `Enter` `Escape`),
uses `role="combobox"` with `aria-expanded` and `aria-activedescendant`, and
filters on a plain substring match over the rendered label.

**The index page.** `/app/weekly-plans` with no client selected is today nothing
but the rail and a "pick a client" message; deleting the rail empties it. It
becomes a centered `EmptyState` with the picker and one line of guidance. No
overview list — declined.

**Space recovered.** The board gains the rail's 224px plus its 12px gap.

## 4. The new-week dialog

`NewWeekMenu`'s dropdown is replaced by a `Dialog`, opened from a single button
in the header. Three cards side by side, the AI card visually featured.

**Card 1 — توليد باستخدام الذكاء الاصطناعي.** Absorbs `GenerateForm` whole:
calorie target, protein target, goal, and the instructions textarea, all at spec
size. Targets stay blank with the profile's figures as placeholders — the
existing reason holds, that a pre-filled value could not be told apart from a
deliberate one. The goal dropdown is **kept** (the mockup omits it; the
capability exists today and is not worth losing).

The card is aware of the plan on screen. When the open plan is a **draft**, its
action reads `إعادة توليد هذا الأسبوع` and overwrites that draft — which is what
the rail's generate button does today. When the open plan is **published**, or
there is none, it creates a new week. One control, sensible either way, and no
orphaned drafts accumulating in the history.

**Card 2 — نسخ خطة سابقة.** A radio list of the client's past plans, each row
showing the week's date range and the calorie target it was built against.
Today only *one* plan is offered — the newest that is not open. `listPlans`
already returns all of them, so offering the full list is a real improvement at
no query cost. The plan currently on screen is excluded: copying a week into
itself is not something anyone means to do.

**Card 3 — البدء بأسبوع فارغ.** Builds the week's slots from the client's meal
schedule with every slot empty. No form.

**Blocking.** All three doors need a complete profile; only the first needs an
OpenAI key. The dialog states which door is unavailable and why, rather than
hiding it — the same reasoning the dish catalog uses for allergen-blocked
dishes.

Server actions are unchanged: `generateWeekAction`, `startWeekFromPlanAction`,
`startEmptyWeekAction`. The route keeps `maxDuration = 120`, since generation
still runs as a server action from this page.

## 5. The rail panels

With the client rail and the generate form both gone, the end rail holds four
tabs: client, dishes, meal, past. `RailTabs` gets pinned so only the panel below
it scrolls, rather than the whole rail.

**Client context.** Loses `GenerateForm` entirely and becomes ten stacked
label/value sections with nothing to anchor them. Restructured: the daily
calorie target and BMI become two stat tiles at the top, because they are the
numbers actually looked at; allergen tags follow as clay-tinted badges;
preferences, dislikes, standing instructions and medical notes collapse behind a
disclosure, since they are prose read once and then skipped; the meal schedule
sits at the bottom as a small table. The `missing fields` warning keeps its
position above everything.

**Dish catalog.** The search field goes to spec height and the filter chips to
`text-label`. The panel's most useful behaviour is currently invisible: when a
meal is open it silently re-sorts by proximity to that slot's budget and
mentions it only in 10px helper text. That becomes an explicit, dismissible
header stating which slot is being filtered against and its budget. Rows become
`Card` at `size="sm"`; the allergen-blocked treatment is unchanged.

**Plan history.** Its per-row copy button becomes redundant the moment the
dialog exists, so the panel stops being a launcher and becomes a viewer: a row
switches the board to that week. This also removes the reason for the duplicate
week-date navigation at the top of the page, which is deleted.

## 6. The day meter

A 6px comfort band sits under each day column's header. The track spans 0–125%
of the daily target; a pale span marks the ±10% tolerance; a marker sits where
the day actually landed.

A plain progress bar was the first proposal and it does not work here. Capped at
the target, a 2133 day and a 2000 day both render full — the one number a
dietitian is scanning for becomes the one the bar cannot show. The band was not
invented for this: the design system already defines `viz-band-range`,
`viz-band-edge` and `viz-band-marker` as "the three-stop band the brand
defines", which is exactly this component.

Colour follows the status rules, not a traffic light. Inside the tolerance the
marker is neutral — a data surface, drawn in the warm neutral ramp, not olive,
which is reserved for things you can act on. Outside it, the marker and the
numeric total both go `status-attention` amber, and the total takes a direction
arrow on the same rule as a meal card. There is no green: the system has no
green-means-go colour, and a day on target is unremarkable rather than a
success.

The day header shows the total alone — `2133 سعرة`, not `2133 / 2000`. The
target is what the band is drawn against, so printing it seven more times says
the same thing twice. It stays in the header strip and in the rail's stat tile.

**No band on individual meal cards.** Thirty-five of them would be exactly the
noise this redesign removes. The amber figure and its arrow carry a meal's
drift.

## 7. The board header

Today's header is one wrapping flex row holding a name, a status badge, a week
date, a week total, a compare button, a raw model ID, a live save status and
three action buttons. It wraps unpredictably at every width.

It splits along a single `ms-auto` boundary with no wrapping:

- **Inline start:** the client picker, the plan status badge, the week date
  range, and the week's calorie total.
- **Inline end:** compare, new week, publish.

`board.model` — currently rendered as `gpt-4o-mini-2024-07-18` in the header —
moves into `MealDetailPanel`. "Which model wrote this" is a fair question about
a meal and meaningless furniture on a toolbar.

The save-status live region keeps `role="status"` and `aria-live="polite"` but
gets a reserved width, so a save no longer reflows the row it sits in.

The two warning banners (`editPublishedWarning`, `unfilledWarning`) keep their
position and behaviour.

## 8. Responsive

Three layouts from the same components. Tailwind's default breakpoints.

| Width | Board | Picker | The four-tab rail |
|---|---|---|---|
| `xl` ≥ 1280px | Seven columns | Header combobox | Fixed end rail, 288px |
| `md`–`lg` 768–1279px | Seven columns, horizontally scroll-snapped, 150px minimum each | Header combobox | Slide-over sheet from the inline end |
| `< md` < 768px | One day at a time | Header combobox, full width | Full-screen sheet |

Below `xl` the rail moves wholesale into the sheet — all four tabs, not just the
meal panel — so there is one place the rail's content lives and one component
deciding how it is presented.

The phone layout reuses the day-selection pattern already built for the client
portal in
[`plan-day-strip.tsx`](../../../src/features/weekly-plans/components/plan-day-strip.tsx):
four days then three, because seven Arabic weekday names do not fit across a
phone and `Intl`'s narrow forms are single letters nobody reads as weekdays.
That component's reasoning transfers directly; the staff version selects a day
in local state rather than in the URL, because the staff board already holds the
whole week in memory and does not need the round trip.

The new-week dialog stacks its three cards vertically below `md`.

## New shared components

Two, both in `src/components/ui/`:

- **`Combobox`** — a searchable single-select. Justified by the client picker,
  and the design system already lists autocomplete as a known gap.
- **`ComfortBand`** — a track with a tolerance span and a value marker, in an
  in-band / out-of-band state. Justified by the day columns, and the one
  component the `viz-band-*` tokens were defined for. Origin and marker position
  are inline-start relative, per the RTL rules.

Anything else the redesign needs is an existing primitive or a `variant` added
to one. No new component may be created inside `src/features/weekly-plans/` that
another feature would plausibly want.

## Files touched

Deleted:

- `components/client-rail.tsx`
- `components/new-week-menu.tsx` (replaced by the dialog)

Added:

- `src/components/ui/combobox.tsx`
- `src/components/ui/meter.tsx`
- `components/client-picker.tsx`
- `components/new-week-dialog.tsx`
- `components/board-sheet.tsx` (the sub-`xl` slide-over)

Rewritten:

- `components/meal-card.tsx`, `day-column.tsx`, `plan-board.tsx`
- `components/context-panel.tsx`, `dish-catalog.tsx`, `plan-history.tsx`
- `components/meal-detail-panel.tsx` (gains the stepper and destructive pair)
- `components/generate-form.tsx` (becomes the dialog's first card)
- `app/[locale]/app/weekly-plans/page.tsx`
- `app/[locale]/app/weekly-plans/[clientId]/page.tsx`

Unchanged: every `.ts` file in the feature. `actions.ts`, `editor-actions.ts`,
`editor-mutations.ts`, `editor-state.ts`, `queries.ts`, `generate.ts`,
`nutrition.ts`, `targets.ts`, `similar.ts`, `skeleton.ts`, `usage.ts`, `week.ts`,
`prompt.ts`, `llm.ts`, `schema.ts` and their tests are untouched. If a change
here requires editing one of them, that is a signal the change has exceeded this
design.

## Testing

The feature's existing test suite covers the `.ts` layer and must keep passing
unchanged — that is the main guard that this redesign stayed presentational.

New unit tests:

- `Combobox` filtering and keyboard navigation.
- `ComfortBand`'s in-band / out-of-band threshold at exactly ±10%, and its
  marker position at, below and above the track's 125% ceiling.
- The drift arrow's direction and threshold: none at 15% off budget, `↓` below,
  `↑` above.
- The dialog's mode selection: draft open → regenerate, published open → new
  week, no plan → new week.

Manual checks, per the UI workflow in `CLAUDE.md`: Arabic RTL and English LTR;
`xl`, `md` and phone widths; keyboard-only reachability of every control that
left a meal card.

## Known risks

**Drag-and-drop does not survive to touch.** dnd-kit is configured for pointer
sensors, and the phone layout shows one day at a time, so dragging a dish
between days is not expressible there. Below `md`, editing is entirely through
the detail sheet — swap, portion, clear, remove. This is a real capability gap on
phones and is accepted rather than solved: a touch drag across a horizontally
scrolling seven-column board is not a good interaction even when it works.

**The portion stepper costs a click.** Section 2's trade. If it proves wrong in
use, the fallback is a hover overlay on the card carrying the stepper alone —
positioned absolutely, so it stays a change to one component and not a reversal
of this design.

**`Combobox` is new surface area.** A searchable listbox with correct ARIA and
keyboard behaviour is more than it looks. It is scoped to single-select with no
multi-select, no async loading, and no free-text entry — everything the picker
needs and nothing it does not.
