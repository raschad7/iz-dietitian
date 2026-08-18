# User guide — guided tour of the staff app

**Date:** 2026-08-18
**Status:** implemented
**Code:** [`src/features/user-guide/`](../../../src/features/user-guide/)

## The problem

A dietitian opening Qiwam for the first time sees five sections in the rail and
no way of learning three things the screens cannot say about themselves:

- a patient is added from a **dialog over the register**, not from a page;
- an appointment is **dragged out of the calendar grid**, not typed into a form;
- the dish catalog is what the **weekly planner draws from**.

None of that is hidden. It is simply not the kind of thing a screen can explain
while also being the screen.

## What was built

A **User guide** row at the foot of the sidebar starts a spotlight tour. It
walks the five sections in the order a working day uses them — Dashboard →
Clients → Calendar → Weekly Plans → Dish catalog — dimming the page and cutting
a hole around one control per step, with a card beside the hole naming it.

Sixteen steps. The tour navigates between routes itself; the reader presses only
Back, Next and Finish.

### The one rule

**A step points; it never presses.**

Every flow the tour describes — the client requests inbox, the client card, the
dish builder — opens a dialog held in a component's own `useState`. A guide that
reached in to open them would be a second thing able to put the app into a state
the app did not ask for, and a guide that can create a real patient by accident.

The cost is that the tour describes those dialogs rather than showing their
insides. That is the right trade for a first-run walkthrough: what a newcomer
does not know is *where the way in is*, and once they are standing in front of it
with its name read out, the dialog explains itself.

## Architecture

| Module | Responsibility |
|---|---|
| `steps.ts` | The tour as data: id, section, route, anchor, preferred side. Nothing else knows its shape. |
| `guide-context.ts` | The context, alone in its own module so the provider and the overlay do not import each other. |
| `guide-provider.tsx` | Which step is showing; pushes the route that step belongs to. Mounted in the staff layout, which is the only thing above both the rail and the page that survives a navigation. |
| `use-guide-anchor.ts` | Finds `[data-guide="…"]`, keeps its rect current on an animation frame, gives up after a timeout. |
| `place-card.ts` | Pure arithmetic: where the card goes beside the hole, flipped and clamped to the viewport. |
| `guide-overlay.tsx` | The dim, the hole, the card, focus, Escape, and `inert` on the shell. |
| `guide-launcher.tsx` | The rail row. Renders nothing when there is no provider, so the client portal is unaffected. |

Anchors are `data-guide` attributes on real elements across six feature folders.
A step and its anchor are checked against each other only by convention — see
*Adding a step* below.

### Decisions worth keeping

**Navigation is a consequence of the step, not something steps do.** A step names
the screen it belongs to; the provider compares that to where the reader is and
closes the gap. So step order alone decides the route the tour takes, consecutive
steps on one screen cost no navigation, and a reader who starts the tour from the
dish catalog is walked back to the dashboard by the same mechanism.

**The rect is re-read every animation frame while a step is up.** Everything the
tour points at can move after it is found: the route is still streaming in, the
element is being smooth-scrolled into view, a phone rotates, the requests card
grows a row. A `MutationObserver` answers "has it appeared" but not "where is it
now"; one frame loop answers both. State is only set when the box actually moved.

**While searching for the next anchor, the previous hole stays.** Advancing
always costs at least one render where the new anchor is unmeasured. Without
retention, every step opened with a blink of flat dim.

**The shell is `inert` for the life of the tour** — including the control in the
spotlight. A highlighted button that looks pressable but has been lit up as an
illustration is worse than one that plainly is not. ⚠ `inert` also removes the
page from the accessibility tree, so each step's copy names its control in words
rather than saying "this button".

**Browser Back ends the tour** rather than being fought by the route-sync effect.

### Responsive

The card has two positions and one appearance:

- **Floating** beside the spotlight, at `≥ 64rem` **and** a fine pointer.
- **Docked** to the top or bottom edge otherwise — every phone, every tablet,
  and any touch screen at any width. It takes the edge the spotlight is furthest
  from, clears the safe-area insets, and is capped at a `42rem` reading width.

Only the *position* differs; a second visual treatment would be a second thing to
keep in step. The step's body is the one part allowed to scroll (`38svh`), so the
progress line, Next and the close button never leave the screen — on a touch
device there is no Escape key to fall back on.

Sides in `steps.ts` are logical (`inline-end`, `block-start`), resolved against
the script in `place-card.ts`. A step written in physical sides would sit on top
of the thing it points at in one of the two languages.

## Adding a step

1. Add an entry to `GUIDE_STEPS` in `steps.ts`.
2. Add `data-guide="<anchor>"` to the element it points at.
3. Add `userGuide.steps.<id>.title` and `.body` to **both** `en.json` and
   `ar.json`.

`GUIDE_STEPS` is `as const satisfies readonly GuideStepShape[]`, so `id` stays a
literal union and a missing translation is a compile error rather than a card
that ships with a title and no body.

Mark a step `optional: true` when its anchor belongs to a state a clinic may not
be in — an empty register draws no table, a clinic with no plans has no suggested
clients. Optional anchors wait 1s instead of 3s before the step falls back to a
centred card with its text intact.

## Leaving the tour

Three ways out, all equivalent: the **Skip guide** button in the card's controls
row, the Escape key, and browser Back.

Skip is a labelled button rather than the ✕ this card first carried. The ✕ and
Escape were the same action wearing two looks, and neither said what it did — on
a panel already covering the whole screen, a bare glyph reads as "close this
card", not "stop the guide". It stands down on the last step, where *Finish* is
the same action with a better name.

The step count moved into the eyebrow (`Dashboard · Step 4 of 16`) to make room:
three controls and a sentence do not fit across a 375px phone.

## Failure modes that were designed out

Three defects were found by instrumenting the running app, and each one's fix is
a rule the feature now keeps.

**Motion may move things; it may not hide them.** The dim originally faded in
from `opacity: 0`, which makes "the animation is not progressing" and "the whole
feature is invisible" the same state. Observed directly on a document whose
timeline never advanced: mounted, positioned, correct, and completely unseeable.
Dropping the `backwards` fill did not help — an animation frozen *inside* its
active interval keeps applying its `from` frame. So nothing in the tour animates
opacity. The cards keep a pure `translate` entrance, which fails safe; the dim
appears instantly.

**The unlayered stylesheet must not set `position`.** Everything in the guide's
CSS block is unlayered, and unlayered CSS beats every `@layer` — Tailwind's
utilities included. A `position: relative` there silently overrode the `fixed`
the docked card asks for, so on every phone and tablet the sheet was pushed off
the top of the screen by its own `bottom` value. On desktop it landed correctly
by coincidence, which is why it survived review.

**The anchor search cannot depend on `requestAnimationFrame` alone.** rAF fires
only while the document is producing frames, and there are ordinary reasons it
stops. When it did, every step silently degraded to a centred card with no
spotlight. A 250ms `setInterval` now measures alongside the frame loop; timers
are throttled rather than stopped in those conditions. The frame loop keeps the
hole glued to its control while the screen is live, and the interval keeps the
feature working when it is not.

A fourth, smaller one: the "does this element have area" guard tested the
*padded* rect, so a 0×0 element clamped at the origin passed as an 8×8 box. It
tests the raw rect now.

## Verification

`bun run lint` and `bun run typecheck` pass. `next build` compiles successfully;
the build's type step still fails on the repository's pre-existing missing
`@playwright/test` dependency, which is unrelated to this work.

No automated tests were added, at the requester's instruction. The behaviour
above was verified by driving the running app through `/dev/shell` and reading
the DOM and computed styles directly — layout, spotlight geometry against its
anchor, the docked sheet at 375px, Arabic RTL mirroring, and Skip restoring
focus to the launcher. Pixels were not verified: the browser pane in use could
not composite frames.
