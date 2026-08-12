# shadcn revamp — inventory and migration plan

Working document for the `shadcn-revamp` branch.

## Ground truth

| | |
| --- | --- |
| Base library | **Base UI** (`base: "base"`, `@base-ui/react` ^1.6.0). Not Radix. |
| Style / preset | `base-nova`, preset code `b2fA`, baseColor `neutral`, radius default |
| RTL | `rtl: true` in `components.json` — registry components ship RTL-aware |
| Icons | **lucide**, per config, reached through the local `Icon` and its `APP_ICONS` registry |
| Registry UI items available | 63 |
| Local UI components today | 33 (~4,500 lines) |
| Total `.tsx` in `src/` | 221 |

The CLI's `info` command lists 18 components as "installed". That is filename
matching only — every one of them is hand-written, not registry source. Treat
the whole local set as un-migrated.

## Token status

`src/app/globals.css` already defines shadcn's full variable contract:
`--background`, `--foreground`, `--card`, `--popover`, `--primary`,
`--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`,
`--ring`, plus the complete `--sidebar-*` set.

This is the single biggest reason the migration is cheap. Registry components
will land already wearing the design.

Extras the registry does not know about, which must survive the migration:
`--primary-hover`, `--primary-subtle`, `--focus-halo`, `--overlay`, `--scrim`,
`--accent-lime`, `--on-accent`, `--destructive-subtle`, `--auth-canvas`, the
`--status-*` set, the `--viz-*` set, `--meal-*`, and the `--duration-*` motion
tokens.

Custom classes carrying real styling that registry components will bypass:
`.q-field` (shared by Input, Textarea, Select), `.q-dialog`.

---

## Part 1 — Local components mapped to the registry

### Direct swap (registry has a 1:1 replacement)

Ordered by blast radius — the number of files importing it.

| Local | Registry | Importers | Notes |
| --- | --- | ---: | --- |
| `button.tsx` | `@shadcn/button` | 65 | Already CVA. Variant names must be reconciled before the swap. |
| `card.tsx` | `@shadcn/card` | 51 | 372 lines local vs registry's composition set. Biggest single rewrite. |
| `input.tsx` | `@shadcn/input` | 22 | Drops `.q-field`. |
| `label.tsx` | `@shadcn/label` | 19 | Trivial. |
| `badge.tsx` | `@shadcn/badge` | 19 | Check status-colour variants map to tokens. |
| `dialog.tsx` | `@shadcn/dialog` | 10 | Native `<dialog>` → Base UI. See note below. |
| `textarea.tsx` | `@shadcn/textarea` | 8 | Drops `.q-field`. |
| `field.tsx` | `@shadcn/field` | 6 | Registry version is much richer (`FieldGroup`, `FieldSet`, validation states). |
| `select.tsx` | `@shadcn/native-select` | 5 | **The registry ships a native-select.** Keeps the native `<select>` benefits with maintained source. |
| `popover.tsx` | `@shadcn/popover` | 5 | Already Base UI. |
| `tooltip.tsx` | `@shadcn/tooltip` | 4 | |
| `table.tsx` | `@shadcn/table` | 3 | |
| `select-menu.tsx` | `@shadcn/select` | 3 | 369 lines local → registry Select. |
| `tabs.tsx` | `@shadcn/tabs` | 2 | |
| `switch.tsx` | `@shadcn/switch` | 2 | |
| `skeleton.tsx` | `@shadcn/skeleton` | 2 | |
| `combobox.tsx` | `@shadcn/combobox` | 1 | Already Base UI. |
| `calendar.tsx` | `@shadcn/calendar` | 1 | Both on react-day-picker. |
| `avatar.tsx` | `@shadcn/avatar` | 1 | Registry requires `AvatarFallback`. |

### Rename to the registry's vocabulary

| Local | Registry | Importers |
| --- | --- | ---: |
| `empty-state.tsx` | `@shadcn/empty` | 7 |
| `callout.tsx` | `@shadcn/alert` | 4 |
| `segmented.tsx` | `@shadcn/toggle-group` | 4 |
| `confirm-dialog.tsx` | `@shadcn/alert-dialog` | 3 |

### Recompose (no 1:1 item; build from registry parts, keep the local API)

| Local | Built from | Importers |
| --- | --- | ---: |
| `confirm-submit-button.tsx` | `alert-dialog` + `button` + `spinner` | 5 |
| `date-picker.tsx` (386 lines) | `calendar` + `popover` (shadcn's documented pattern) | 4 |
| `phone-field.tsx` | `input-group` + `input-group-addon` | 2 |
| `copy-button.tsx` | `button` + `tooltip` | 2 |
| `time-field.tsx` | `input-group` | 1 |
| `time-select.tsx` | `select` | 1 |

### Keep — genuinely yours, no registry equivalent

| Local | Importers | Why it stays |
| --- | ---: | --- |
| `icon.tsx` | **76** | The icon system, lucide behind an app-name registry. Highest blast radius in the repo; do not touch. |
| `stat-tile.tsx` | 2 | Domain KPI tile. Could rebase onto `@shadcn/item`. |
| `chart-tip.tsx` | 1 | Pairs with `@shadcn/chart` if charts get migrated. |
| `comfort-band.tsx` | **0** | Domain viz — **and nothing imports it.** Dead code; delete or justify. |

---

## Part 2 — Registry components missing from the project

30 of the 63 registry UI items have no local counterpart. These are pure
additions — nothing to break, so they carry the least risk and the most value.

**Tier 1 — the app currently has no answer for these at all**

- `toast` — there is no toast/notification system anywhere in the codebase.
  Base UI project, so use `@shadcn/toast`, **not** `sonner`.
- `dropdown-menu` — `src/components/layout/` hand-rolls menu behaviour.
- `alert-dialog` — replaces `confirm-dialog`.
- `sidebar` — `src/components/layout/sidebar.tsx` is custom; the `--sidebar-*`
  tokens are already defined and waiting.
- `sheet` — no side-panel primitive exists.
- `checkbox`, `radio-group` — no primitives; forms use raw inputs.
- `separator` — currently `<div className="border-t">` in several places.
- `spinner`, `progress` — no loading primitives.
- `direction` — RTL direction provider. Relevant given Arabic support.

**Tier 2 — will be needed as features are rebuilt**

`form`, `input-group`, `toggle-group`, `item`, `command`, `scroll-area`,
`accordion`, `collapsible`, `breadcrumb`, `pagination`, `kbd`, `hover-card`,
`button-group`, `native-select`

**Tier 3 — probably not needed**

`aspect-ratio`, `carousel`, `context-menu`, `menubar`, `navigation-menu`,
`resizable`, `input-otp`, `slider`, `toggle`, `drawer`, `chart`, and the chat
set (`message`, `bubble`, `message-scroller`, `attachment`, `marker`,
`questionnaire`)

---

## Part 3 — Reuse debt in feature folders

40 files under `src/features/` and `src/app/` render native controls inline
instead of composing shared components. Raw `<button>` elements by feature:

| Feature | Raw `<button>` |
| --- | ---: |
| `weekly-plans` | 12 |
| `portal` | 5 |
| `booking` | 5 |
| `clients` | 4 |
| `auth` | 3 |
| `notifications` | 2 |
| `dashboard` | 1 |
| `clinic-profile` | 1 |

This is the actual obstacle to the "reusable components" goal — not gaps in the
registry. `eslint-rules/` already exists, so this can be enforced rather than
remembered.

---

## Decisions — settled

**1. Icons: keep `icon.tsx`, now backed by lucide.** The set is lucide itself,
so a registry component arriving with `lucide-react` imports is already drawing
from the right family. Rewrite those imports to the local `Icon` anyway: what a
call site asks for is the role (`addClient`, not `user-plus`), which is what
lets a glyph be re-pointed in one place. Required on **every** component added.

**2. Native `<dialog>` → Base UI Dialog: yes.** Decided by the reported bugs,
not by preference. See below.

---

## Reported bugs and their root causes

Four of the six reported issues are the **same defect**, not four defects.

### The popup-layer defect — issues 1, 2 and 4 — FIXED

**Root cause: one wrong CSS keyword.** Diagnosed in the browser, not inferred.

`globals.css` animated the open dialog with
`animation: q-dialog-in-card 200ms var(--ease-sweep) both`. All three entrance
keyframes (`q-dialog-in-sheet`, `q-dialog-in-card`, `q-dialog-backdrop-in`)
declare **only a `from` block**, and under `both` the forwards fill keeps the
animation's properties applied for as long as the dialog stays open. A settled
dialog therefore computed:

```
transform: matrix(1, 0, 0, 1, 0, 0)
filter:    blur(0px)
```

Identity and zero — but **not `none`**. Any transform or filter other than
`none` makes an element the containing block for its `position: fixed`
descendants.

Every popup in the app measures its trigger against the viewport and places
itself `fixed` at those coordinates. Inside an open dialog those coordinates
were resolved against the *dialog* instead, so each popup landed offset by
roughly the dialog's own top-left. Measured on the gallery page at 1280×720:
the activity select rendered **408px to the inline-end and 165px below** its
trigger. That is issues 2 and 4 exactly, and the date picker running off the
dialog edge in issue 1.

It affected Base UI popups (`popover`, `combobox`) and the hand-rolled
`select-menu` equally, because the defect was in the containing block, not in
either positioning implementation.

**The fix — `both` → `backwards` on the two entrance rules.** `backwards` keeps
the only thing the fill was wanted for, the from-state applied before the first
frame so there is no flash on slow devices, and drops the part that was never
meant to persist. The closing rules keep `both`: their keyframes declare only a
`to`, so they need the forwards fill to hold the end state, and a closing dialog
has nothing left to mis-anchor.

Verified after the change: dialog computes `transform: none` and `filter: none`;
the select renders flush with its trigger (0px inline offset, 4px below, equal
width); the date picker stays inside the viewport at 1280×720 and flips to
`side: top` at 375×812.

**This did not require the shadcn migration.** It is worth recording because the
plan above assumed the native `<dialog>` was implicated and that the popups had
to move together to fix it. Neither was true. `select-menu` is still worth
replacing — it has no flip, shift, size clamping or re-measure on scroll, and
that will show up on a long list near a viewport edge — but it is now a
maintenance decision rather than a bug fix, and the pieces no longer have to
move in one PR.

### Issue 3 — textarea grows without limit

`textarea.tsx` sets `field-sizing-content` with `min-h-24` and **no maximum**,
so the box grows with content until it overruns the dialog.

**Fix:** `@shadcn/textarea` with a max height plus overflow, and the dialog body
wrapped in `@shadcn/scroll-area`.

### Issue 5 — browser-native dropdown

`booking/components/repeat-field.tsx:91` uses the local `Select`, which is a
native `<select>`, so the OS renders its own unstyled menu.

**Fix:** `@shadcn/select`. This is the case where `native-select` is *not* what
you want — keep `native-select` only for short, plain lists.

### Issue 6 — client search bar

`weekly-plans/components/client-picker.tsx` hand-rolls the search field.

**Fix:** `@shadcn/combobox`, or `@shadcn/command` inside a popover if it should
support filtering across many clients.

### Toast — sonner, and why it is the one exception

This said "add `@shadcn/toast` (Base UI — **not** sonner)", on the general rule
that a Base UI project takes Base UI primitives. It shipped that way, and then
the planner rebuild replaced it with **sonner**. That reversal is deliberate and
should not be undone without reproducing what caused it:

> the Base UI toast measured its animated height synchronously after a drop and
> could trap Chromium in a resize/update loop, **freezing the whole planner**
> after the database write had already succeeded.

The board is the one screen that posts a toast from inside a drag: a drop
commits, re-renders the board optimistically, and announces itself, all in the
same frame. Sonner owns measurement and stacking in its own tree, which keeps
that work off the planner's render path. The move announcement also moved out of
`plan-board` and into `board-dnd`, so the toast no longer fires from a component
that re-renders the board — the two halves of the same fix.

Two things follow from sonner not being Base UI:

- **It needs `dir` passed explicitly.** `DirectionProvider` is Base UI's own
  channel and sonner cannot read it, and the toaster sits outside the layout
  flow so it does not inherit `dir` from `<html>` either. The root layout passes
  `dir={getLocaleDirection(locale)}`.
- **Its API is `toast.success(msg, { description })` / `toast.error(msg)`**, not
  Base UI's `toast.add({ type, title })`. Anything still calling `.add` predates
  the swap.

Everything else in `components/ui` stays on Base UI.

---

## Sequence

Stacked PRs off `shadcn-revamp`. Not one merge.

Bug-driven order — the reported issues come first, because they are the reason
for the branch.

1. **Foundations** — reconcile tokens, fold `.q-field` / `.q-dialog` into
   component source, add `direction`. Build a `/dev/ui` kitchen-sink route
   showing every component in AR/EN, light/dark, mobile/desktop.
2. **The popup layer** — `dialog`, `select`, `popover`, `calendar`,
   date-picker pattern, `scroll-area`, `textarea`. Issues 1, 2 and 4 are already
   closed by the `animation-fill-mode` fix, so this no longer has to land as one
   PR and can be split by component. What remains here is issue 3 (textarea
   ceiling), issue 5 (`repeat-field`), and retiring `select-menu` for flip,
   shift and size clamping it has never had.
3. **`toast` + `combobox`** — closes issue 6 and the weekly-plans meal-replace
   feedback.
4. **Remaining low blast radius swaps** — the 1–5 importer components.
5. **Tier 1 additions** — dropdown-menu, alert-dialog, sidebar, sheet,
   checkbox, radio-group, separator, spinner, progress.
6. **High blast radius swaps** — `input` (22), `label`/`badge` (19), `card`
   (51), `button` (65). One PR each.
7. **Recompositions** — phone-field, time-field, confirm-submit.
8. **Feature cleanup** — replace inline controls, add the lint rule.

Per `CLAUDE.md`, each PR runs `bun run lint`, `bun run typecheck`, `bun run test`
and is checked in both directions and both breakpoints before handoff.
