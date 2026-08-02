# Weekly Plan Editor — Design

Date: 2026-08-02
Branch: `drop-meal-plans-and-foods`

## Purpose

Weekly plans today has exactly one way in: generate a week with the model, then
correct it meal by meal from a rail. That is the right tool for a client's first
plan and the wrong one for their fifth. A returning client already has a plan
that worked; next week is usually the same week with three meals changed and the
calories nudged, and there is currently no way to express that except to
regenerate everything and repair the result.

Two gaps follow from it:

- **The previous plan is invisible.** `listPlans` exists and the page renders the
  week-start dates as links (`[clientId]/page.tsx:80`), but only when there is
  more than one plan, and clicking one replaces the board. There is no way to see
  last week while building this week, so "did she already have مسخن on Monday" is
  unanswerable without leaving the page you are working on.
- **Editing is limited to substitution.** A meal can be swapped for another dish.
  It cannot be removed, moved to another day, added to a single day, or portioned
  from the board. Anything structural means regenerating.

This design adds a real editor beside the generator, and makes the previous plan
readable from inside the one being built.

## Scope

In:

- Three ways to start a week: AI generation, copy of a previous week, or an empty
  week from the client's schedule.
- Per-plan overrides for calorie target, protein target, and goal, applied to one
  week without touching the client's nutrition profile.
- A dish catalog tab in the board rail, filtered to the selected slot, marking
  dishes this client has had recently.
- Drag and drop from the catalog into a slot, and between slots.
- Removing a meal, adding a meal to one day, clearing a slot, and changing
  servings from the board.
- A compare toggle that shows what occupied each slot in the previous plan, and
  flags repeats.
- A history tab listing the client's past weeks, with the copy action.
- Editing a published plan in place, behind an explicit mode.

Out (deliberately):

- Recording client feedback on meals ("liked", "wouldn't eat"). It needs a schema
  and a capture point in the appointment or portal flow, and it is a separate
  piece of work.
- Comparing more than one week back on the board. The history tab covers older
  weeks; the board compares against the immediately previous plan only.
- A dish editor, or any write path to the catalog.
- Regenerating a whole day or a whole week on a published plan. See
  [Editing a published plan](#editing-a-published-plan).
- Multi-user conflict resolution on one draft. See [Known risks](#known-risks).

## The three doors

The board header carries a **New week** menu. All three entries produce a `draft`
plan for the same week and land on the same editable board; they differ only in
what the board starts with.

| Entry | Produces |
| --- | --- |
| Generate with AI | The existing flow, plus the per-week override fields below. |
| Start from `<week>` | Every meal of the chosen plan, copied. No model call. |
| Empty week | One meal per slot in the client's schedule, all with `dish_id` null. |

Generation stops being the only way a plan comes into existence. `generated_by`
is `'ai'` for the first and `'manual'` for the other two — the column already
carries exactly this distinction and needs no new value.

### What "start from" copies

Verbatim from the source plan: `kcal_target_snapshot`, and for every meal its
`day_of_week`, `slot_key`, `label`, `time_of_day`, `budget_kcal`, `dish_id` and
`servings`.

Not copied:

- `rationale_ar`. It is the model's explanation of a choice made for a different
  week. Carrying it forward would attribute reasoning to meals nobody reasoned
  about, under a plan the model never saw.
- `weekly_plan_meal_options`. Same reason — they were that week's alternatives.
- `week_instructions`, `model`, and the generation overrides. A copy was not
  generated, and labelling it with the model that produced its ancestor would be
  a lie in the audit trail.

The copy takes the source plan's slots rather than rebuilding them from the
client's current `meal_schedule`. "Start from 27 July" should produce the week of
27 July; if the schedule has moved on, the dietitian adds or removes slots by
hand, which is now possible. Adjusting targets is what the generate door is for.

## Board layout

The board keeps its seven columns. The changes are at the edges.

### Header

The client rail (`client-rail.tsx`) is removed from the board page and becomes a
switcher in the header. Once you are inside a client's board, a list of the
clinic's other clients is dead weight in the most contested horizontal space on
the screen. The rail stays as-is on the index page (`weekly-plans/page.tsx`),
where picking a client *is* the task.

Header contents, in order: client switcher, **New week** menu, the week pills
with status, the compare toggle, a live totals readout, the save-status region,
and the publish control.

### Rail

The single end rail becomes four tabs:

| Tab | Contents |
| --- | --- |
| Client | `ContextPanel`, unchanged. |
| Dishes | The catalog, filtered and draggable. New. |
| Meal | `MealDetailPanel`, unchanged in substance. |
| Past | The client's previous plans, with the copy action. New. |

Opening a meal card selects the Meal tab, preserving today's behaviour. The
dietitian can then switch to Dishes without losing the selection — the selected
meal is what the Dishes tab filters against.

### Cards

`MealCard` gains, in order: the slot label and time (currently only the label),
the dish name, kcal against `budget_kcal`, and — when compare is on — a ghost
line naming what held that slot in the previous plan.

A meal whose dish is unchanged from the previous plan renders with the
`status.attention` tokens and a repeat marker. Not `destructive`: repeating a
dish is information, not an error, and `docs/design-system.md` is explicit that
red is reserved for genuine medical flags.

Empty slots keep today's dashed treatment. They are gaps to close before
publishing, and the unfilled banner already counts them.

A **+ meal** control sits at the foot of each column.

## Compare with the previous plan

One toggle in the header, defaulting to off, labelled with the plan it compares
against. "Previous" means the client's plan with the greatest `week_start_date`
strictly less than the current plan's, breaking ties on `updated_at` — the same
ordering `getLatestBoard` already uses.

The comparison is keyed on `(day_of_week, slot_key)`. A slot present in this week
and absent from the previous plan shows no ghost line; a slot present in the
previous plan and absent from this one is not shown at all, because there is no
card to hang it on. That asymmetry is acceptable: the question the dietitian is
asking is "what was here before", not "what have I dropped".

Comparison data is a dedicated lightweight read, not a second `getBoard`. The
board only needs a dish name and kcal per slot, and assembling a full costed
board for the previous week would double the page's query cost to render one
muted line per card.

## The dish catalog tab

Sourced from `loadCatalog(allergens)` — the same allergen-filtered read the swap
list already uses, so a dish that generation was forbidden from choosing cannot
enter a plan by being dragged either.

Behaviour:

- **Default filter follows the selection.** With a meal selected, the list opens
  filtered to that slot's meal type (`mealTypeForSlot`) and sorted by proximity
  to its `budget_kcal`. With nothing selected, it is the unfiltered catalog.
- **Search** over `name_ar`, `name_en`, and `slug`, matching `listDishes`.
- **Tag filters** over the existing `DISH_TAGS`.
- **Recent-use badges.** A dish this client has had in a recent plan is marked
  with how long ago. See below.
- **Allergen dishes are shown, disabled, and labelled with the allergen.** They
  are excluded from `loadCatalog(allergens)`, so this needs the unfiltered
  catalog alongside it. Hiding them produces the worse failure: a dietitian
  searching for a dish they know exists, finding nothing, and concluding the
  catalog is broken.

### Recent use

A new query in `usage.ts`: for one client, the most recent `week_start_date` on
which each dish appears in any of their plans, within a window.

The window is the plan being edited plus the previous four `week_start_date`
values that client has plans for — not four calendar weeks. A client who missed a
month should still see that مسخن was in their last plan; calendar arithmetic
would silently drop it.

The badge renders as an ordinal against that list, derived from position rather
than from date subtraction: the plan being edited reads "this week", the one
before it "last week", then "2 weeks ago" and so on. Including the current plan
matters — the commonest repeat to avoid is the one you just placed on Tuesday.

`previousPlanSlugs` (`queries.ts:793`) is the nearest existing thing and stays as
it is — it feeds the prompt, returns slugs, is capped at 60, and has no notion of
recency. The new query returns dish ids with dates. Two callers, two shapes.

## Edit operations

All eight are server actions with matching mutations. `place` and `swap`
collapse into one: dropping a dish on a filled slot is exactly what
`swapMealDish` already does.

| Operation | Semantics |
| --- | --- |
| `placeDish(mealId, dishId, servings?)` | `swapMealDish`. Servings default to `bestServings(baseKcal, budgetKcal)`, falling back to `1` when either is zero. The replaced dish is demoted to an option, so a mistaken drop is one click to undo. |
| `setServings(mealId, servings)` | Clamped and snapped by `snapServings`. |
| `clearMeal(mealId)` | `dish_id` to null, `servings` to 1, `rationale_ar` to null. The slot stays. |
| `removeMeal(mealId)` | Deletes the row. The slot is gone from that day. |
| `addMeal(dayOfWeek, label, timeOfDay)` | Inserts a row with `budget_kcal` 0. |
| `moveMeal(fromMealId, toMealId, mode)` | Copies `dish_id` and `servings` into the target slot. `mode: 'move'` then clears the source. |
| `startWeekFromPlan(sourcePlanId, weekStartDate)` | As specified above. |
| `startEmptyWeek(clientId, weekStartDate)` | Slots from `meal_schedule`, budgets from `slotBudgets`. |

Three details that decide behaviour and must not be left to implementation
taste:

**Moving copies the dish, not the row.** `label`, `time_of_day` and `budget_kcal`
are snapshotted per meal, deliberately (see `weekly-plans.ts:117`). Moving the
row would carry Monday lunch's 647 kcal budget into whatever slot it landed on,
so a lunch dropped on a breakfast slot would quietly re-budget breakfast. Copying
the dish and servings into the target leaves the target slot's own identity
intact, which is what the dietitian sees and expects.

**An added meal is unbudgeted.** `budget_kcal` 0 already means "no budget"
everywhere in the feature — `meal-card.tsx:37` and `:65`, `queries.ts:646`, and
`isSimilar` in `similar.ts` all guard on `> 0`. The added meal's calories count
toward the day total, and the day header will show the day running over its
target, which is true and is the point. Recomputing every budget on the day to
make room would rewrite the numbers the rest of the week was generated against.

**Added slot keys are `extra_1`, `extra_2`, …** The unique index is
`(plan_id, day_of_week, slot_key)`, so the counter is per day. It is derived from
the keys already present in that day, taking the lowest unused index — not from a
count, which would collide after a removal. `mealTypeForSlot` does not recognise
the stem and falls back to `lunch`, which is the correct default: it is the most
broadly stocked category, and the dietitian chose this slot's label themselves.

## Editing a published plan

Publishing currently makes a plan read-only (`plan-board.tsx:46`), and correcting
a live plan means unpublish → edit → republish, with a window where the client's
portal shows nothing.

A published board opens read-only, as now, with an **Edit published plan** toggle
in the header. Turning it on is the confirmation — one dialog, using the existing
`confirm-submit-button.tsx` — after which the board is editable and carries a
persistent strip stating that changes are immediately visible to the client. A
per-drop confirmation is not viable in a drag interface.

`status` and `published_at` never change. Only `updated_at` moves. The partial
unique index on `(client_id, week_start_date) where status = 'published'` is
untouched, because nothing about status changes.

Allowed in this mode: every operation in the table above, plus regenerating a
single meal. Not allowed: regenerating a day, and generating a week. Rewriting
five or thirty-five meals under a client who is following them is not a
correction; it is a new plan, and the New week menu is the door for that.

Guards become "the plan is `draft`, or it is `published` and the call carries
`allowPublished`", applied in the mutation layer rather than the action layer, so
the rule cannot be bypassed by a caller that forgets it. `archived` is refused
either way.

`allowPublished` is a submitted form field, set by the header toggle. It is a
deliberate-action check, not a security boundary — a published plan is the
clinic's own record and `requireStaffClinic` has already authorised the writer.
Its job is to make "I meant to change a live plan" an explicit statement in the
request rather than an inference from which button was on screen. The mutation
still verifies clinic ownership and plan status independently.

## Per-week overrides

`weekly_plans` gains two nullable columns:

| Column | Why |
| --- | --- |
| `protein_target_snapshot integer` | `prompt.ts:120` reads the protein target from the profile. A week generated against a different figure has to record it. |
| `goal_snapshot text` | `prompt.ts:117` reads `client.goal`. Same reason. Constrained to `CLIENT_GOALS` in Zod, not in the database, matching how `goal` is handled on `clients`. |

Both are snapshots in the same sense `kcal_target_snapshot` already is: written
once when the plan is created, never read from the profile afterwards.

The generate panel pre-fills all three from the client's effective values and
writes whatever the dietitian submits onto the plan. **The nutrition profile is
never modified by this flow.** A one-week experiment must not silently become the
client's standing target; changing that is what the profile page is for.

Prompt assembly reads `plan.<field> ?? profile.<field>`, so a week generated
without touching the fields produces byte-identical prompt input to today.

`kcal_target_snapshot` is already `not null` and stays that way. The override
panel writes it directly; there is no second column for it.

## A latent bug this work exposes

`assembleBoard` builds its dish lookup from `loadCatalog()`, which filters
`is_active = true` (`queries.ts:96`). A plan referencing a dish that has since
been deactivated therefore renders as an **empty slot** — with no explanation,
and inflating the unfilled count that gates publishing.

This is wrong today. Copying old weeks makes it common enough to matter.

Fix, in scope here: board assembly loads the dishes a plan actually references by
id, regardless of `is_active`, and a retired dish renders as itself with a
marker. The catalog tab and the swap lists continue to offer active dishes only —
you may keep a retired dish that is already in a plan, but you may not add one.

## Optimistic updates

Every edit today is a `<form action>` with a `revalidatePath`. That is fine at
one click a minute and unusable at drag-and-drop rates.

The board holds a `useOptimistic` layer over the server board. Each edit applies
locally, then fires its action inside a transition; `revalidatePath` reconciles.

This is unusually safe here. `nutrition.ts` is pure and already imported by
client components, and the board payload carries full ingredient lists for every
dish on it. The optimistic recomputation of meal, day and week totals is
therefore **the same arithmetic the server runs**, not an approximation — numbers
do not flicker to a wrong value and then correct.

The reducer is written as a pure function, `(board, edit) => board`, in its own
module. That is what makes every drag outcome unit-testable without a browser,
and it is the main reason for the shape.

Cost: the Dishes tab ships the catalog with ingredients to the client. It is
already loaded server-side in one query; serialised it is on the order of a few
hundred kilobytes for the current 76 dishes. Acceptable for an internal clinic
tool, and worth revisiting if the catalog grows by an order of magnitude.

## Drag and drop

New dependency: `@dnd-kit/core`.

Native HTML5 drag and drop does not work on touch, and the dietitian uses a
tablet some of the time. dnd-kit provides pointer, touch and keyboard sensors
from one implementation.

The keyboard sensor is not optional. `MealCard` is a real button today and the
board is fully keyboard-operable; an editor reachable only by mouse would be a
regression. Every drag has an equivalent keyboard path, and dragging a dish from
the catalog also has a click-to-place fallback: select a slot, activate a dish.

RTL: dnd-kit's collision detection is coordinate-based and direction-agnostic,
but drop targeting under `dir="rtl"` is where this is most likely to break and is
verified explicitly in Arabic rather than assumed.

## Error handling

There is no toast primitive in `src/components/ui/`, and this feature is not a
good reason to introduce one.

A failed edit reverts the optimistic state and writes into a small `aria-live`
status region in the board header — the same region that shows the saved
indicator. Quiet on success, explicit on failure, correct for screen readers, and
no new subsystem.

Actions return the existing `PlanActionState` shape from `form-state.ts` rather
than a new one.

## File layout

`actions.ts` is 631 lines and `mutations.ts` 492 before any of this. Growing them
is the wrong move.

```text
src/features/weekly-plans/
  actions.ts             generation, publish, profile (trimmed)
  editor-actions.ts      the eight edit actions
  editor-mutations.ts    their writes
  editor-state.ts        the pure optimistic reducer
  usage.ts               recent-dish-usage query and ordinal labelling
  queries.ts             + previous-plan comparison read
  components/
    board/               plan-board, day-column, meal-card, drop targets
    rail/                tabs, context, dish catalog, meal detail, history
```

Component subdirectories because `components/` reaches thirteen files with the
new ones and splits cleanly along a real boundary — what is in the grid, and what
is in the rail.

## Testing

Pure, no database:

- `editor-state.test.ts` — every drag outcome through the reducer: drop on a
  filled slot, drop on an empty slot, move versus copy, remove the last meal in a
  day, servings clamped at `MIN_SERVINGS` and `MAX_SERVINGS`, and the totals after
  each.
- Slot-key allocation: `extra_1` on a fresh day, `extra_2` alongside it, `extra_1`
  again after `extra_1` is removed.
- `usage.ts` ordinal labelling, including a client with fewer than four plans and
  one with a gap in weeks.

Against the test database, following `mutations.test.ts`:

- Copy fidelity: meals, budgets and servings copied; rationales, options and
  model metadata not.
- Every new mutation refuses a plan belonging to another clinic.
- Every new mutation refuses an `archived` plan, and refuses a `published` plan
  unless the acknowledged flag is set.
- `addMeal` respects the per-day unique index.
- A plan referencing an inactive dish assembles with that dish present.

UI verification per `CLAUDE.md`: Arabic and English, mobile and desktop, and a
visual check of the rendered board.

## Build order

Larger than one sitting, and the pieces have a natural dependency order. Each
stage leaves the feature working and shippable on its own.

1. **Board assembly fix.** Plans render dishes regardless of `is_active`. Small,
   independent, and a correctness fix everything else builds on.
2. **The three doors.** `startWeekFromPlan`, `startEmptyWeek`, the New week menu,
   and the Past tab. Delivers the copy workflow with no editor at all — the
   dietitian can already copy a week and swap meals with today's rail.
3. **Per-week overrides.** The two columns, the generate panel fields, and the
   prompt fallback.
4. **The editor.** The remaining six actions, the optimistic reducer, dnd-kit,
   the Dishes tab, and the header restructure.
5. **Compare and recent use.** The comparison read, the ghost lines, `usage.ts`
   and the badges.
6. **Published-plan editing.** The mode toggle and the guard change.

Stage 4 is the largest and does not divide cleanly further: the reducer, the drag
implementation and the header rearrangement land together or the board is broken
in between.

## Known risks

**Two dietitians on one draft is last-write-wins.** The loser's next revalidation
corrects their board; no locking, no conflict UI. For a single-clinic tool with
one or two practitioners this is the right trade, but it is a choice, not an
oversight.

**Editing a published plan has no audit trail.** The plan records that it changed
(`updated_at`) but not what changed or who changed it. If that becomes a
requirement it is a new table, not a column.

**The board page's query count grows.** It already loads the catalog, the board,
the swap candidates and the client list; this adds the previous plan's meals and
the client's recent dish usage. Both are small indexed reads on
`(client_id, week_start_date)`, but the page is worth measuring after this lands.

**Generation still runs as a server action with `maxDuration = 120`.** Unchanged
by this work, and still the standing risk recorded in the V2 design.
