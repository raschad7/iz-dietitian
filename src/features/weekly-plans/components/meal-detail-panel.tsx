'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import { MEAL_TOLERANCE, driftState } from '@/features/weekly-plans/drift';
import {
  NUTRIENT_KEYS,
  NUTRIENT_UNITS,
  dishGrams,
  roundForDisplay,
  roundGrams,
  type NutrientKey,
} from '@/features/weekly-plans/nutrition';
import { localizedName, secondaryName } from '../food-display';
import { dishAccentClass } from '../meal-tag-tone';

import { swapMealAction } from '../actions';
import { initialPlanActionState } from '../form-state';
import type { BoardMeal, CatalogEntry, SwapCandidate } from '../queries';
import type { RecentUse } from '../usage';

import { useEditorActions } from './board-dnd';
import { DishCatalog } from './dish-catalog';
import { MealIngredientAmounts } from './meal-ingredient-amounts';
import { MealIngredientEditor } from './meal-ingredient-editor';
import { MealSides } from './meal-sides';

/**
 * Everything about one meal: what it is, what it contains, why it was chosen, and
 * what could replace it.
 *
 * Occupies the same end-side rail as the context panel rather than a modal — the
 * dietitian compares a meal against the rest of the week while reading it, and a
 * dialog would cover the board they are comparing it to.
 */
export function MealDetailPanel({
  meal,
  candidates,
  catalog,
  usage,
  planId,
  locale,
  editable,
  model,
  onClose,
  onBrowseDishes,
  embedded = false,
}: {
  meal: BoardMeal;
  candidates: readonly SwapCandidate[];
  /** The whole catalog, so an empty slot can be filled without leaving the panel. */
  catalog: readonly CatalogEntry[];
  usage: Record<string, RecentUse>;
  planId: string;
  locale: string;
  editable: boolean;
  model?: string | null;
  onClose: () => void;
  onBrowseDishes: () => void;
  /** The anchored inspector owns the close button in its floating frame. */
  embedded?: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const { clear, place, remove } = useEditorActions();

  /*
   * An empty slot opens straight onto the catalog.
   *
   * The panel used to answer the click with a title, a short list and a button
   * that opened the catalog *somewhere else* — two steps and two surfaces to
   * answer the only question an empty slot asks. The catalog already defaults
   * its filters to the open slot's meal type and ranks by fit to its budget, so
   * dropping it in here loses nothing and removes the step: click the slot, pick
   * the dish, done. Filling it closes the panel, because the question is
   * answered.
   */
  if (editable && !meal.dish) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* The same header shape a filled slot gets — `font-medium`, not
            `font-semibold`. The two panels are the same surface answering two
            states of one slot, and a heavier title on the empty one made it read
            as a different, louder dialog every time a slot happened to be
            empty. */}
        <div className={cn('shrink-0 border-b border-border px-5 pb-4 pt-5', embedded && 'pe-14')}>
          <p className="text-caption text-muted-foreground">
            {meal.label} · {meal.timeOfDay}
          </p>
          <h3 className="mt-1 font-heading text-heading-sm font-medium leading-snug">
            {t('fillSlot')}
          </h3>
          {/* What the list below is ranked by, said once at the top instead of
              as a tinted banner in the middle of the panel — see `DishCatalog`. */}
          <p className="mt-1 text-caption text-muted-foreground">{t('fillSlotHint')}</p>
        </div>

        <div className="min-h-0 flex-1 px-5 py-3">
          <DishCatalog
            catalog={catalog}
            usage={usage}
            slot={{ slotKey: meal.slotKey, budgetKcal: meal.budgetKcal }}
            editable={editable}
            onPick={(dish, servings) => {
              place(meal.id, dish, servings);
              onClose();
            }}
          />
        </div>

        {/*
          One control, so it takes the row.

          `Button` caps itself at `max-w-80` — a label that needs more than 320px
          is a label that needs rewriting — and that cap is right for a button
          sitting in a sentence and wrong for the only control in a footer: it
          left a lone destructive button floating at 320px in a 464px panel with
          28px of dead rail either side, which reads as a button that failed to
          lay out rather than one deliberately sized. `max-w-none` is the
          documented way past it, the same escape the browse button uses.
        */}
        <section className="shrink-0 border-t border-border bg-muted/45 px-5 py-3">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-full max-w-none"
            onClick={() => remove(meal.id)}
          >
            <Icon name="trash" />
            {t('removeMeal')}
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={cn('relative flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-5', embedded && 'pe-14')}>
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">
            {meal.label} · {meal.timeOfDay}
          </p>
          <h3 className="mt-1 font-heading text-heading-sm font-medium leading-snug" dir="auto">
            {meal.dish ? localizedName(meal.dish, locale) : t('emptySlot')}
          </h3>
          {meal.dish && secondaryName(meal.dish, locale) && (
            <p className="text-caption text-muted-foreground" dir="auto">
              {secondaryName(meal.dish, locale)}
            </p>
          )}
          {meal.dish && (
            <span
              aria-hidden
              className={cn('mt-3 block h-1 w-20 rounded-full', dishAccentClass(meal.dish.ingredients))}
            />
          )}
        </div>

        {!embedded && (
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t('close')}
          </Button>
        )}
      </div>

      {/*
        ── Two views, not one column ──

        Everything below used to be one scroller: the quantity card, the sides,
        the replacement list, a browse button, the nutrition table and the
        model's rationale, in that order, one after another. Each of them earns
        its place. Stacked, they are a page a dietitian scrolls through hunting
        for the two rows they opened the panel to change — and the two halves
        answer *different questions*. "What is on this plate, and is the chicken
        right" is a question about the meal in front of you. "Should this be a
        different meal" is a question about replacing it. Nobody asks both in one
        breath, and putting them in one column means always scrolling past the
        answer you did not want.

        So: **the plate**, which is the panel's default because it is the common
        case and the one with the controls on it; and **the alternatives**, which
        is a whole surface for the swap list and the catalog instead of a
        footnote under the ingredients.

        Rendered only when the plan can be edited. A published week has no swap
        list and no browse button, so a tab bar there would be one tab — a
        control that offers no choice, which is furniture. That branch keeps the
        single column it always had.
      */}
      {editable && meal.dish ? (
        <MealViews
          plate={<PlateView meal={meal} catalog={catalog} locale={locale} editable={editable} />}
          options={
            <>
              <div className="flex items-baseline justify-between gap-2 pb-2">
                <h4 className="text-label font-semibold">{t('replacementOptions')}</h4>
                <span className="text-caption text-muted-foreground">{t('closestFirst')}</span>
              </div>

              {meal.options.length > 0 ? (
                <Alternatives meal={meal} planId={planId} locale={locale} />
              ) : (
                <SimilarDishes meal={meal} candidates={candidates} planId={planId} locale={locale} />
              )}

              {/*
                The way out of a list of three.

                The swap list is the model's shortlist or the catalog's three
                nearest by energy, and the honest thing to say under it is that
                the other two hundred and seventy are one press away. It sits at
                the end of this view rather than in the middle of a column, so it
                reads as "or, none of these" instead of interrupting the
                ingredients.
              */}
              <Button
                type="button"
                variant="default"
                className="mt-4 w-full max-w-none"
                onClick={onBrowseDishes}
              >
                <Icon name="dishes" />
                {t('browseAllDishes')}
              </Button>
            </>
          }
        />
      ) : (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4">
          {meal.dish && (
            <PlateView meal={meal} catalog={catalog} locale={locale} editable={editable} />
          )}
        </div>
      )}

      {model && <span className="sr-only">{t('generatedBy')} · {model}</span>}

      {/*
       * Pinned to the panel, not parked at the end of the scroller.
       *
       * These two are the panel's only destructive controls and they were the
       * last thing in a column that also holds the replacement list, the
       * ingredients, the nutrition table and the model's rationale — so
       * emptying a slot meant scrolling past all of it, and on a short window
       * they sat below the fold with nothing indicating they existed. A footer
       * outside the scroller costs 60px of the list and makes them reachable
       * from wherever the panel happens to be scrolled to.
       *
       * `shrink-0` is load-bearing: the sibling above is `flex-1 min-h-0`, and
       * without it a long ingredient list would compress the footer rather than
       * scroll under it.
       */}
      {/*
        Why nothing here can be changed, said where the question is asked.

        The board used to carry this as a banner under its header, which cost
        ~34px of a grid that cannot grow and shoved the week down the moment a
        plan went live. It belongs here instead: a published plan's panel is the
        surface a dietitian opens *expecting* a stepper and a swap list, finds
        neither, and needs a sentence. On the board, the header's struck-through
        eye has already said the same thing to anyone looking at the controls.
      */}
      {!editable && meal.dish && (
        <p className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/45 px-5 py-3 text-caption leading-relaxed text-muted-foreground">
          <Icon name="eyeOff" className="size-4 shrink-0" />
          <span className="min-w-0">{t('publishedReadOnly')}</span>
        </p>
      )}

      {/* `max-w-none` on both, so the pair actually halves the row. Without it
          `Button`'s own 320px ceiling applies to each of them and the two come
          out different widths whenever their labels do — two peer controls that
          look like a primary and a secondary. */}
      {editable && (
        <section className="flex shrink-0 gap-2 border-t border-border bg-muted/45 px-5 py-3">
          {meal.dish && (
            <Button
              type="button"
              variant="neutral"
              size="sm"
              className="min-w-0 max-w-none flex-1"
              onClick={() => clear(meal.id)}
            >
              <Icon name="clearSlot" />
              {t('clearMeal')}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="min-w-0 max-w-none flex-1"
            onClick={() => remove(meal.id)}
          >
            <Icon name="trash" />
            {t('removeMeal')}
          </Button>
        </section>
      )}
    </div>
  );
}

/**
 * How long the outgoing view has to fade before the incoming one replaces it.
 *
 * **Must stay in step with `--duration-reverse`** in `globals.css`, which is the
 * speed the fade runs *out* at: the CSS takes the panel down and this decides
 * when it is safe to swap the contents, so if the two disagree the new view
 * appears over the old one.
 *
 * A constant rather than a `transitionend` listener, for the same reason the
 * client record uses one — the element that has to finish fading is the one
 * about to be replaced, so waiting on its own event means waiting on a subtree
 * that is going away.
 */
const CROSSFADE_MS = 140;

type MealView = 'plate' | 'options';

/**
 * The panel's two views, and the switch between them.
 *
 * ## Why `Segmented` and not `PanelTabs`
 *
 * Both are tablists and both were correct here. `Segmented shape="pill"` is the
 * one this app *moves*: the selection is a white card that travels along a grey
 * well, and the four other places a reader meets a two-or-three-way switch —
 * Settings, the client record, the portal's appointment list, the calendar's
 * view picker — all draw it. `PanelTabs` re-tints in place, so switching a view
 * here happened instantly and silently while the same gesture on the client
 * record next door slid. One control, two behaviours, is a system with a seam.
 *
 * The labels come with it: full-strength `text-foreground` on the selected
 * segment and `font-normal` throughout, where the tab bar set the active label
 * in semibold green. Green marks what you can *act on*; a switch only says which
 * view you are in, and the raised card already says it.
 *
 * ## Why the content crossfades
 *
 * The thumb takes `--duration-arc` to travel and the view under it used to
 * change on the first frame — so the eye followed a moving card to a panel that
 * had already finished changing. Fading the outgoing view out, swapping while
 * nothing is on screen, and fading the new one in makes the two halves of the
 * gesture one movement.
 *
 * The 4px of travel is vertical on purpose. A horizontal slide would have to
 * pick a direction and the reading direction inverts between Arabic and
 * English; vertical reads the same in both.
 */
function MealViews({ plate, options }: { plate: React.ReactNode; options: React.ReactNode }) {
  const t = useTranslations('weeklyPlans');

  /*
   * Two copies of the same key. `active` is where the switch is heading and
   * moves the thumb immediately; `shown` is what the panel renders and lags by
   * one fade, so the swap happens on an empty panel rather than under the
   * reader's eye.
   */
  const [active, setActive] = React.useState<MealView>('plate');
  const [shown, setShown] = React.useState<MealView>('plate');
  const swapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
    },
    [],
  );

  function goTo(next: MealView): void {
    if (next === active) return;
    setActive(next);

    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => setShown(next), instant ? 0 : CROSSFADE_MS);
  }

  const settled = active === shown;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pt-3">
        <Segmented
          label={t('mealViews')}
          shape="pill"
          value={active}
          onChange={goTo}
          options={[
            { value: 'plate', label: t('plateTab') },
            { value: 'options', label: t('optionsTab') },
          ]}
        />
      </div>

      {/*
        One scroller, not one per view. The panel's height is fixed and the two
        views are different lengths, so a scroller each would mean the bar
        jumping as the shorter view arrived. `key` on the inner box resets the
        scroll position to the top when the view changes, which is where a view
        you have just switched to should start.
      */}
      <div
        className={cn(
          'no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-4 pt-3',
          'transition-[opacity,translate] ease-(--ease-sweep) motion-reduce:transition-none motion-reduce:translate-y-0',
          settled
            ? 'translate-y-0 opacity-100 duration-(--duration-label)'
            : 'translate-y-1 opacity-0 duration-(--duration-reverse)',
        )}
      >
        <div key={shown}>{shown === 'plate' ? plate : options}</div>
      </div>
    </div>
  );
}

/**
 * The plate: what is on it, and the controls that change it.
 *
 * ## Why the sides sit with the quantities
 *
 * They are the same question. A meal is the main plus what stands beside it, and
 * a dietitian setting the chicken to 170 g is doing the same job as the one
 * deciding whether the lunch keeps its salad — both are "what does this person
 * actually eat". They used to be two sections separated only by a margin, with
 * the replacement list immediately after, so the panel read as three peers when
 * two of them are one thing.
 *
 * ## Why almost everything here is folded
 *
 * What is open is what gets pressed: the two or three primary ingredients of the
 * main, and one select per side. Everything else — the rest of the recipe, each
 * side's own ingredients, the nutrition table, the model's reasoning — is
 * reference, and reference is a press away with a count on the row so you know
 * whether the press is worth it. See `IngredientDisclosure`.
 */
function PlateView({
  meal,
  catalog,
  locale,
  editable,
}: {
  meal: BoardMeal;
  catalog: readonly CatalogEntry[];
  locale: string;
  editable: boolean;
}) {
  const t = useTranslations('weeklyPlans');

  return (
    <>
      <MealQuantity meal={meal} locale={locale} editable={editable} />

      <MealSides
        mealId={meal.id}
        slotKey={meal.slotKey}
        sides={meal.sides}
        lines={meal.lines}
        catalog={catalog}
        locale={locale}
        editable={editable}
      />

      {/*
        ── The model's reasoning is not on this panel any more ──

        `rationaleAr` was a disclosure down here — "why this meal" — holding a
        sentence the model wrote about its own choice. It is still generated and
        still stored; it is simply not something a dietitian planning a week
        needs a row for.

        Two reasons it went. It is an explanation of a decision that has already
        been made and can be changed in two clicks on the next tab, so reading it
        never changes what anyone does — and it is the software arguing for
        itself on the surface where the dietitian is meant to be the one
        deciding. A panel that fits in one screen is worth more than a
        justification nobody asked for.

        What is left under the plate is the nutrition table, which is a fact
        about the food rather than a claim about the choice.
      */}
      <div className="mt-5 border-t border-border">
        {/* No "ingredients" disclosure any more. The card above IS the
            ingredient list now — every line of it, at the amount prescribed —
            so a second copy down here would be the same facts twice, and the
            two would read as though they might differ. */}
        <Disclosure label={t('nutrition')}>
          <Nutrients meal={meal} />
        </Disclosure>
      </div>
    </>
  );
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 text-label font-semibold text-muted-foreground outline-none focus-visible:text-foreground [&::-webkit-details-marker]:hidden">
        {label}
        <Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

/**
 * What this meal is, as a list of amounts a person can act on.
 *
 * Three wrong answers preceded this one. The first was `×2.25`, the raw
 * `servings` value: correct arithmetic, and meaningless to anyone not holding the
 * base recipe in their head. The second was the recipe itself, every line of it —
 * onion, oil, tomato paste, 2 g of cumin — which is a production list, not
 * something a person plates. The third was a hand-written serving guide per dish,
 * two lines of editorial text that could not move when the meal did.
 *
 * What it states now is the meal's own ingredients, at the amounts prescribed,
 * with a `−/+` on the two or three a dietitian actually adjusts. The list and the
 * control are the same object: pressing `+` on the chicken changes the line you
 * are reading, and nothing else on the plate moves.
 *
 * The controls are **not rendered at all** when the panel is read-only. They used
 * to render disabled, on the argument that a control which vanishes teaches
 * nothing; but on a published plan every quantity here is a statement of what was
 * prescribed, and a greyed −/+ sitting on top of that reads as a thing that is
 * broken rather than a thing that is settled.
 */
function MealQuantity({
  meal,
  locale,
  editable,
}: {
  meal: BoardMeal;
  locale: string;
  editable: boolean;
}) {
  const t = useTranslations('weeklyPlans');

  const kcal = roundForDisplay('kcal', meal.totals.kcal.value);
  const drift = driftState(kcal, meal.budgetKcal, MEAL_TOLERANCE);

  /*
   * The main's lines, and the weight of those lines only.
   *
   * `meal.grams` is the *plate* — main plus every side — which is the right
   * figure for the meal and the wrong one for this card, now that each side
   * carries its own weight on its own row. Printing 775 g over a list that
   * accounts for 640 of them is a card that does not add up, and the reader who
   * notices has no way to find the missing 135.
   *
   * The energy strip at the foot stays the whole plate, because that is what the
   * budget beside it is measured against. Weight is a property of a list;
   * calories are a property of the meal.
   */
  const main = meal.lines.filter((line) => line.side === null);
  const mainGrams = t('totalGrams', { value: roundGrams(dishGrams(main, 1), 5) });

  /*
   * How far off the slot this plate is, signed, so nobody has to subtract.
   *
   * Null when there is no budget to be off, and when the plate lands exactly on
   * it — "+0" is a difference that says there is none, drawn as though there
   * were one.
   */
  const gap = meal.budgetKcal > 0 ? kcal - meal.budgetKcal : 0;
  const difference = gap === 0 ? null : `${gap > 0 ? '+' : '−'}${Math.abs(gap)}`;

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-3">
        <h4 className="text-label font-semibold text-foreground">{t('mealQuantity')}</h4>
        {/* The dish's weight, stated once. It is a summary of the list below
            rather than something to set, so it sits with the heading and not
            beside a control. */}
        <span className="text-body-sm text-muted-foreground tabular-nums">{mainGrams}</span>
      </div>

      {editable ? (
        <MealIngredientEditor
          mealId={meal.id}
          lines={main}
          locale={locale}
          hasOwnAmounts={meal.hasOwnAmounts}
        />
      ) : (
        <MealIngredientAmounts lines={main} locale={locale} />
      )}

      {/*
        ── The energy, and what it is being measured against ──

        This was one grey caption in a rounded box: "797 kcal · الميزانية 772
        kcal", at 14px in `text-muted-foreground`, under a list of steppers. It
        is the *answer* to everything above it — the reason a dietitian presses
        those steppers at all — and it was drawn as a footnote about them.

        Two figures on one row now, at heading size, with the labels above them
        and the difference between them stated rather than left to be worked
        out. A plate 25 kcal over its slot is a fact the reader should be able to
        take from this row without subtracting anything.

        The drift colour is on the difference alone, not on the whole line. The
        meal's own energy is never wrong — it is what the food adds up to — and
        painting it amber said the number was the problem when the gap is.

        `<bdi dir="ltr">` on every figure, and the block itself left to the
        panel's direction. A bare `dir="ltr"` on the paragraph would align the
        number to the *left* of an Arabic panel while its label stayed right:
        the value and the thing it is labelled by would sit at opposite edges of
        the same box. `bdi` isolates the numeral's internal direction and leaves
        the alignment to the panel, which is what puts the two on the same edge
        in both scripts.
      */}
      <div className="mt-3 flex items-end justify-between gap-4 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">{t('mealEnergy')}</p>
          <p className="mt-0.5 font-heading text-heading-sm font-medium tabular-nums leading-none">
            <bdi dir="ltr">{t('kcalValue', { value: kcal })}</bdi>
          </p>
        </div>

        {meal.budgetKcal > 0 && (
          <div className="min-w-0 text-end">
            <p className="text-caption text-muted-foreground">{t('slotBudget')}</p>
            <p className="mt-0.5 text-body-md font-medium tabular-nums leading-none text-muted-foreground">
              <bdi dir="ltr">{t('kcalValue', { value: meal.budgetKcal })}</bdi>
              {difference !== null && (
                <>
                  {' '}
                  <bdi
                    dir="ltr"
                    className={cn('font-semibold', drift ? 'text-status-attention-fg' : 'text-primary')}
                  >
                    ({difference})
                  </bdi>
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Nutrients({ meal }: { meal: BoardMeal }) {
  const t = useTranslations('weeklyPlans');
  const tNutrients = useTranslations('weeklyPlans.nutrients');

  return (
    <section>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-body-sm">
        {NUTRIENT_KEYS.map((key: NutrientKey) => {
          const total = meal.totals[key];

          return (
            <div key={key} className="flex justify-between gap-2">
              <dt className="truncate text-muted-foreground">{tNutrients(key)}</dt>
              <dd className="shrink-0 tabular-nums">
                {roundForDisplay(key, total.value)} {NUTRIENT_UNITS[key]}
                {/* "Not measured" is not zero, and a total built partly from
                    unmeasured foods is a floor rather than an answer. */}
                {total.unmeasured > 0 && (
                  <span className="text-muted-foreground" title={t('unmeasured')}>
                    {' '}
                    +
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function SwapButton({
  planId,
  mealId,
  dishId,
  servings,
  locale,
  children,
  flagged,
}: {
  planId: string;
  mealId: string;
  dishId: string;
  servings: number;
  locale: string;
  children: React.ReactNode;
  flagged?: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  /*
   * The swap revalidates the board, so the new dish is simply *there* on the
   * next render — which is the problem this reports. A row quietly changing in
   * a panel the eye has already left is indistinguishable from nothing having
   * happened, and the failures were worse: the action's result used to be
   * thrown away entirely, so a swap refused for a published plan looked
   * exactly like a successful one.
   *
   * Awaited here rather than read back through `useActionState` and announced
   * from an effect: the announcement belongs to *this* submission, and an
   * effect watching a result object has to be keyed carefully to fire twice
   * for two identical outcomes. Awaiting has neither problem.
   */
  async function formAction(formData: FormData): Promise<void> {
    const state = await swapMealAction(initialPlanActionState, formData);
    if (state.status === 'done') {
      toast.success(t('mealReplaced'), {
        description: t('mealReplacedHint'),
      });
      return;
    }

    if (state.status === 'error') {
      toast.error(t(state.messageKey));
    }
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="mealId" value={mealId} />
      <input type="hidden" name="dishId" value={dishId} />
      <input type="hidden" name="servings" value={servings} />
      <SwapSubmit flagged={flagged}>
        <span className="min-w-0">{children}</span>
      </SwapSubmit>
    </form>
  );
}

function SwapSubmit({
  children,
  flagged,
}: {
  children: React.ReactNode;
  flagged?: boolean;
}) {
  const { pending } = useFormStatus();
  const t = useTranslations('weeklyPlans');

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 text-start text-body-sm transition-colors hover:bg-accent/70 disabled:opacity-50',
        flagged && 'ring-1 ring-inset ring-status-attention-fg/30',
      )}
    >
      {children}
      <span className="inline-flex items-center gap-1 font-semibold text-primary">
        {pending ? '…' : t('replaceMeal')}
        {!pending && <Icon name="chevronEnd" className="size-4" />}
      </span>
    </button>
  );
}

/** The alternatives the model offered, with an honest note when one is not a real swap. */
function Alternatives({ meal, planId, locale }: { meal: BoardMeal; planId: string; locale: string }) {
  const t = useTranslations('weeklyPlans');

  if (!meal.options.length) return null;

  return (
      <div className="grid gap-1">
        {meal.options.slice(0, 3).map((option) => (
          <SwapButton
            key={option.id}
            planId={planId}
            mealId={meal.id}
            dishId={option.dishId}
            servings={option.servings}
            locale={locale}
            flagged={!option.isSimilar}
          >
            <span className="block font-medium" dir="auto">{localizedName(option, locale)}</span>
            <span className="mt-0.5 block text-muted-foreground">
              {t('kcalValue', { value: roundForDisplay('kcal', option.kcal) })}
              {!option.isSimilar && (
                <span className="text-status-attention-fg"> · {t('offBudget')}</span>
              )}
            </span>
          </SwapButton>
        ))}
      </div>
  );
}

/**
 * The deterministic swap list.
 *
 * Distinct from the AI's alternatives on purpose: these are computed from the
 * catalog by calorie proximity, cost nothing, and are the same every time — so the
 * dietitian knows which suggestions came from a model and which from arithmetic.
 */
function SimilarDishes({
  meal,
  candidates,
  planId,
  locale,
}: {
  meal: BoardMeal;
  candidates: readonly SwapCandidate[];
  planId: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');

  if (!candidates.length) return null;

  return (
      <div className="grid gap-1">
        {candidates.slice(0, 3).map((match) => (
          <SwapButton
            key={match.candidate.id}
            planId={planId}
            mealId={meal.id}
            dishId={match.candidate.id}
            servings={match.servings}
            locale={locale}
          >
            <span className="block font-medium" dir="auto">{localizedName(match.candidate, locale)}</span>
            {/* Kcal only, like the AI alternatives above: a swap candidate carries
                no ingredient rows, so its weight cannot be derived here, and its
                energy against the slot budget is the figure that matters anyway. */}
            <span className="mt-0.5 block text-muted-foreground">
              {t('kcalValue', { value: roundForDisplay('kcal', match.kcal) })}
            </span>
          </SwapButton>
        ))}
      </div>
  );
}
