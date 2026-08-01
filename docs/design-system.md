# Design system — Qiwam / قوام

This app's visual language is Qiwam. The full brand and design spec is
[`Qiwam Design System.html`](Qiwam%20Design%20System.html) — open it
in a browser, it's a rendered document, not markup to read raw. This file is
the plain-language summary a coding agent or a new contributor needs
to build UI correctly without re-reading the whole spec every time.

**Before building or touching any UI, check `src/components/ui/` first.**
If the thing you need (a button, a card, a form field, a status badge)
already exists there, use it — add a `variant` prop to it if it needs to
differ, don't rebuild a local version inside a feature folder. If it doesn't
exist and you're building something genuinely new and reusable, it belongs
in `src/components/ui/`, not copied into `src/features/<feature>/`.

## Where the tokens live

`src/app/globals.css` defines two layers:

1. **Primitives** — the raw Qiwam palette (`--olive-600`, `--lime-400`,
   `--n-25`, ...). Never reference these directly from a component.
2. **Semantic tokens** — `--background`, `--primary`, `--status-medical-fg`,
   etc. — mapped from primitives, and wired into Tailwind via `@theme
   inline` so components consume them as ordinary utility classes
   (`bg-primary`, `text-muted-foreground`, `bg-status-attention-bg`).

Components consume semantic tokens only. If you find yourself writing a hex
code or an oklch value inside a `.tsx`/`.jsx` file, stop — either the token
you need already exists (check §06 and §15 of the spec) or it's genuinely
per-record data (see "Arbitrary colour, not a token" below), not a
copy-pasted value. `eslint-rules/no-raw-hex.mjs` enforces this outside
`globals.css`.

## Olive vs. lime

- **Olive is ink.** It's the primary brand colour — buttons, links, active
  states, headers. Use it freely; it behaves like a neutral, not a treat.
- **Lime is a spotlight, not a colour.** It marks *one* thing per screen —
  usually the comfortable range on a balance band, or the single primary
  action in a completion flow (`<Button variant="accent">`). If you're
  reaching for lime a second time on the same screen, stop — that's the
  brand rule breaking, not a style choice.
- **Lime never carries text or an icon on a light surface.** Contrast is
  1.37:1 on white — it is illegal, not just discouraged. The only legal
  text-on-lime pairing is `text-on-accent` (olive-950) on `bg-accent-lime`,
  and that pairing is already wired into `Button`'s `accent` variant. Don't
  build a second one.
- **No blue, anywhere.** Not links, not focus rings, not "info" banners.
  If a pattern you're copying from another project reaches for blue, it
  needs a Qiwam-native replacement — usually olive for identity/links, or
  a status colour (below) for state.

## Status colours are not a traffic light

| Meaning | Token | Colour | Never |
|---|---|---|---|
| On track | `status.onTrack` | olive-700 on olive-100 | — |
| Needs follow-up | `status.attention` | amber-700 on amber-100 | red |
| Missed / incomplete | `status.incomplete` | neutral-700 on neutral-100 | **red** — a missed day is information, not a failure |
| Medical flag | `status.medical` | clay-700 on clay-100 | using this for anything that isn't a genuine allergy/condition/contraindication |
| Rest day | `status.rest` | olive-700 on olive-50 | treating it as a missed day |

Clay is the system's **only true alarm colour**. Don't reach for it (or for
`variant="destructive"`) to mean "this is bad" in a general sense — reach
for the status that actually describes what happened. `Badge` already has
`onTrack` / `attention` / `incomplete` / `medical` / `rest` variants wired to
these tokens; use them instead of ad hoc `bg-{color}-100 text-{color}-700`
combinations.

`destructive` (on `Button`, form error text, etc.) maps to clay too — a
delete confirmation is a deliberate, serious action, which is what clay is
for.

## Shape — "the Arc" (§9)

Components aren't neutral rectangles. Every interactive surface carries one
**swept corner** — the Q's tail — on the block-end/inline-end corner
(`rounded-ee-*`, a logical property, so it mirrors to bottom-left in Arabic
automatically, no override needed). The other three corners keep a plain,
smaller radius. **One tail per surface** — never sweep two corners, and
never repeat the sweep on a nested child of an already-swept parent.

| Component | Base radius | Swept corner | Notes |
|---|---|---|---|
| Button, Input, Select, Textarea | 10px | 24px, → 30px on hover, → 18px on press | `rounded-[10px] rounded-ee-xl`, `hover:rounded-ee-[30px]` |
| Icon button | `rounded-full` | ~29% of the button's size | scales with size, see `button.tsx` |
| Card | 16px (`rounded-lg`) | 32px (`rounded-ee-4xl`) | |
| Chips, badges | pill (`rounded-full`) | none — chips don't sweep | this is the one shape that stays a plain pill |

Radius scale otherwise: `sm` 8px · `md` 12px · `lg` 16px · `xl` 24px. **Never
`rounded-none`** — everything in this system has a corner.

Text fields draw an additional cue on focus: a 2px olive line grows from
0% to 58% width along the bottom edge (`.q-field-arc` in `globals.css`,
`:focus`-driven, RTL-aware via `:dir()`). **Form fields don't use the lime
focus ring** buttons use — a form has many fields, and lime flashing on every
tabbed-to field breaks "lime is one element per screen." Fields get
`border-primary` (olive-600) + a 3px olive-100 halo (`ring-field-focus-halo`)
instead; buttons keep the lime ring + olive-950 halo from §06/§11.

Motion: corner growth and any "drawing" animation uses
`cubic-bezier(.2,.6,.2,1)` (`motion.sweep.ease`) at ~200–220ms. Don't invent
a different easing curve for a new sweep animation — reuse this one.

## Spacing & shadows

- Spacing is Tailwind's default 4px scale — nothing Qiwam-specific to
  remember here. Card padding is 16px mobile / 20px desktop
  (`--card-spacing` already handles this in `Card`).
- Shadows are olive-tinted, never neutral black — use the `shadow-card` /
  `shadow-elevated` / `shadow-overlay` utilities, not an arbitrary
  `shadow-[...]`.

## Fonts

- **Readex Pro** (`font-heading`) — headings only (`h1`–`h4` get this
  automatically via `@layer base` in `globals.css`). Never body text.
- **IBM Plex Sans Arabic** (`font-sans` / `font-arabic`) — everything else:
  UI chrome, body copy, form fields, tables.
- **IBM Plex Mono** (`font-mono`) — token values, record IDs, technical
  strings only. Never client-facing copy.
- No `text-transform: uppercase` and no `letter-spacing` on Arabic — both
  break cursive joining and Arabic has no case. `globals.css` already zeroes
  letter-spacing under `:lang(ar)`; don't add uppercase utilities to
  Arabic-facing labels.

## RTL requirements — logical properties only

This app ships Arabic (RTL) and English (LTR) from the same components. A
physical `margin-left`/`pl-4`/`text-left` that looks right in English is
silently wrong in Arabic, and the bug is invisible until someone reads the
RTL build.

- Use `margin-inline-start` / `ms-*`, `padding-inline-end` / `pe-*`,
  `text-start` / `text-end`, `border-inline-start` / `border-s-*` — never
  the physical equivalent. `eslint-rules/logical-properties.mjs` enforces
  this for Tailwind utility classes; it's a lint error, not a style
  preference.
- Icons that encode direction (arrows, back/next, send) mirror in RTL.
  Icons that don't (clock, chart, checkmark, logo) never do.
- Numbers, times, and units keep LTR internal order even inside RTL text.
- Progress fills, sliders, and comfort bands originate from the
  **inline-start** edge, not a hardcoded side.

## Arbitrary colour, not a token

A few places store a genuinely arbitrary hex per record — a client's
calendar colour (`clients.color`), a practitioner's colour, the avatar
palette in `src/lib/avatar-color.ts`. These aren't brand tokens and were
never meant to come from the Qiwam palette; they exist so people are
visually distinguishable from each other. That's why the no-raw-hex lint
rule is scoped to `.tsx`/`.jsx` only — those values live in `.ts` data/query
files, not component markup. If you find a *brand* colour (something that
should have come from `globals.css`) hardcoded as a literal hex inside a
component, that's a bug — replace it with the semantic token, don't add it
to this exemption.

## Known gaps (not yet wired)

- `src/features/booking/components/appointment-block.tsx` hardcodes
  `#16a34a`/`#dc2626` for drag valid/invalid feedback, and
  `day-column.tsx`/`appointment-block.tsx` use Tailwind's built-in
  `emerald-500` alongside `destructive` for the same purpose. Both are
  traffic-light colours the brand explicitly forbids — this needs a real
  fix (likely `status.onTrack`/`status.medical`), not a token substitution,
  and it touches drag-and-drop visuals, so it wasn't done as part of the
  token rollout.
- Chart series colours (`--color-chart-1`..`5`) are a derived reuse of
  existing brand/status hues — the spec only defines a 3-stop comfort-band
  trio (`viz.band.*`), not a categorical series palette. Confirm with design
  before a real multi-series chart ships.
- §9 defines several components this codebase doesn't have yet: checkbox,
  radio, switch, segmented control, stepper (§9.3), the Q-arc progress/habit
  ring with milestone nodes (§9.6), the streak-week and 4-week-adherence
  components (§9.6), navigation with the travelling lime node (§9.5), and
  the loading/skeleton/toast motion system (§9.7). None of these exist
  anywhere in `src/components/ui/` or have a current caller — building them
  now would be net-new surface with no consumer to validate against, so
  they weren't scaffolded speculatively. When a feature needs one of these,
  build it against §9's spec directly rather than approximating it with a
  generic library component.
