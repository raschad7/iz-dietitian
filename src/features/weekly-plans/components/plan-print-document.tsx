'use client';

import { Fragment, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useFormatter, useTranslations } from 'next-intl';

import { getLocaleDirection, type Locale } from '@/i18n/routing';

import { localizedName } from '../food-display';
import { ingredientAmount } from '../meal-quantity';
import { NUTRIENT_UNITS } from '../nutrition';
import { type PrintDay, type PrintMeal, type PrintPlan } from '../plan-print';
import { dayKey } from '../schema';

/* Module constants so their identities are stable across renders — the hook
   re-subscribes whenever `subscribe` changes, and an inline arrow changes on
   every one. See `appointment-request-fab.tsx` for the longer version. */
const NEVER = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * The class the print stylesheet and the Word export both key on. Exported so
 * `plan-word.ts` can find this element in the DOM rather than re-deriving the
 * document it already rendered.
 */
export const PRINT_ROOT_CLASS = 'plan-print';

/**
 * The week as the sheet a client takes home, drawn only when the page is
 * printed — and read back out of the DOM when the same week is saved as Word.
 *
 * ## Why this is not a route
 *
 * The obvious shape for "download the plan" is a second page that renders the
 * plan on its own and prints itself. That page would have to be routed to,
 * guarded, and would re-read the plan from the database — so the dietitian
 * waits through a navigation and a query round trip to see a document the
 * browser already had every byte of, and the copy they get is the *saved* plan
 * rather than the one in front of them.
 *
 * This renders from `useEditor`'s optimistic board instead, in the page that is
 * already open. Pressing either export button acts in the same frame: no
 * navigation, no fetch, and an edit made a second ago is in the file.
 *
 * ## Why every meal is a table row
 *
 * Not for the gridlines — there are none down the middle of this document. It
 * is what makes the Word export possible: Word has no flexbox and no CSS grid,
 * so a two-column meal built with either collapses into a stack when the `.doc`
 * opens. It has understood tables for thirty years. One structure in the DOM
 * serves the print stylesheet and the Word file, so the two exports cannot
 * drift, and the borders are turned off everywhere they would read as a grid.
 *
 * ## Why it is portalled to `<body>`
 *
 * The print stylesheet works by hiding every direct child of `<body>` except
 * this one (see `globals.css` § "Printing a week"). That is a single rule with
 * no list of app chrome to keep in step — but it only holds if this element
 * *is* a direct child. Left where it is written, deep inside the board, it
 * would also inherit the board's `overflow: hidden` and its pinned height, and
 * a printed page clipped to the height of a scroll frame is one page long
 * whatever the plan says.
 *
 * It is `display: none` on screen and costs a paint of nothing; only the print
 * media query brings it back.
 */
export function PlanPrintDocument({
  plan,
  clinicName,
  locale,
}: {
  plan: PrintPlan;
  /** Printed above the client's name. Null when the clinic has none recorded. */
  clinicName: string | null;
  locale: Locale;
}) {
  const t = useTranslations('weeklyPlans');
  const tPrint = useTranslations('weeklyPlans.print');
  const format = useFormatter();

  /*
    `document` does not exist while this renders on the server, and the portal
    target must be the real `<body>` rather than a node of our own — the print
    rule keys on body's own children. So the document appears at hydration.

    The store, rather than `useState` seeded by an effect: this is an
    environment fact React already knows, and an effect that fires once to flip
    a boolean buys a second render pass to answer it. Same shape as
    `useHydrated` in `guide-overlay.tsx` and the FAB in the portal.
  */
  const hydrated = useSyncExternalStore(NEVER, onClient, onServer);

  if (!hydrated) return null;

  return createPortal(
    /*
      `dir` and `lang` are stated rather than inherited: this is a child of
      `<body>`, so it sits beside the app rather than inside it, and the
      planner's own direction context does not reach it. The Word export copies
      this element whole, and a `.doc` that opened left-to-right on an Arabic
      plan would be the same bug in a different program.
    */
    <div className={PRINT_ROOT_CLASS} dir={getLocaleDirection(locale)} lang={locale}>
      {/*
        The client's name is the largest thing on the page, because the page is
        theirs. The clinic sits above it in the size a letterhead is, and the
        week and the daily target close the band on the far edge.
      */}
      <header className="plan-print-masthead">
        <div className="plan-print-identity">
          {clinicName && <p className="plan-print-clinic">{clinicName}</p>}
          <h1 className="plan-print-client">{plan.clientName}</h1>
        </div>

        <div className="plan-print-facts">
          <span>{t('weekOf', { date: printedDate(format, plan.weekStartDate, 'long') })}</span>
          <span className="plan-print-target">
            {t('dailyTargetShort', { value: plan.kcalTarget })}
          </span>
        </div>
      </header>

      {/*
        The two things that change what the sheet is — a draft, or a week with
        empty slots. Ruled rather than coloured, because an amber warning on a
        monochrome office printer is a grey sentence indistinguishable from the
        rest of the page.
      */}
      {(!plan.published || plan.unfilled > 0) && (
        <p className="plan-print-caveat">
          {!plan.published && <span>{tPrint('draftNote')}</span>}
          {plan.unfilled > 0 && <span>{t('unfilledWarning', { count: plan.unfilled })}</span>}
        </p>
      )}

      {plan.days.map((day) => (
        <PrintDaySection key={day.dayOfWeek} day={day} locale={locale} />
      ))}
    </div>,
    document.body,
  );
}

/** One day: a heading, then its meals in the order they are eaten. */
function PrintDaySection({ day, locale }: { day: PrintDay; locale: Locale }) {
  const t = useTranslations('weeklyPlans');
  const tDays = useTranslations('weeklyPlans.days');
  const format = useFormatter();

  return (
    <section className="plan-print-day">
      {/*
        The heading is a `<p>` inside an `h2`-less section on purpose: Word
        applies its own Heading styles to `h2` and overrides the sizes here.
        The section is still labelled for a screen reader by its first line.
      */}
      <div className="plan-print-day-head">
        <span className="plan-print-day-name">{tDays(dayKey(day.dayOfWeek))}</span>
        {day.date && (
          <span className="plan-print-day-date" dir="auto">
            {printedDate(format, day.date, 'long')}
          </span>
        )}

        {/* The day's own numbers, on the far edge. Calories lead because that is
            the figure the plan was built against; protein follows because it is
            the one macro a client is usually asked to watch. */}
        <span className="plan-print-day-total">
          <span className="plan-print-day-kcal">{t('kcalValue', { value: day.kcal })}</span>
          <span className="plan-print-day-macro">
            {t('nutrients.protein')} {day.macros.protein} {NUTRIENT_UNITS.protein}
          </span>
        </span>
      </div>

      <table className="plan-print-meals">
        <tbody>
          {day.meals.map((meal) => (
            <PrintMealRow key={meal.id} meal={meal} locale={locale} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * One meal: when, what, and how much.
 *
 * Three cells — the hour on the reading edge, the food in the middle where the
 * width is, the calories on the far edge — so a client running down the page
 * finds every meal's time in one column and every meal's cost in another.
 */
function PrintMealRow({ meal, locale }: { meal: PrintMeal; locale: Locale }) {
  const t = useTranslations('weeklyPlans');
  const tPrint = useTranslations('weeklyPlans.print');

  return (
    <tr className="plan-print-meal">
      <th className="plan-print-meal-when" scope="row">
        <span className="plan-print-meal-slot" dir="auto">
          {meal.label}
        </span>
        {/* The stored `HH:mm` as written, the same string the board's slot rail
            prints. A locale-formatted clock here and a bare one there would be
            two spellings of one meal time. */}
        <span className="plan-print-meal-time">{meal.timeOfDay}</span>
      </th>

      <td className="plan-print-meal-what">
        <p className="plan-print-dish" dir="auto">
          {meal.dishName ?? t('emptySlot')}
        </p>

        {/*
          What to actually put on the plate.

          Written along the line rather than as a stacked list: three to five
          short pairs read perfectly well in a sentence, and a list of them
          would triple the height of every meal on a document that also has to
          carry the alternatives. The amount is the emphasised half of each
          pair, because it is what the reader is scanning for.
        */}
        {meal.lines.length > 0 && (
          <p className="plan-print-portions">
            {meal.lines.map((line, index) => {
              const amount = ingredientAmount(line, locale);

              return (
                <Fragment key={line.food.id}>
                  {/* A literal separator, not a CSS `::before`: Word renders no
                      generated content, and the Word file is this same markup. */}
                  {index > 0 && <span className="plan-print-sep"> · </span>}
                  <span className="plan-print-portion" dir="auto">
                    {localizedName(line.food, locale)}{' '}
                    <b className="plan-print-amount">
                      {amount.kind === 'grams'
                        ? t('gramsShort', { value: amount.grams })
                        : amount.text}
                    </b>
                  </span>
                </Fragment>
              );
            })}
          </p>
        )}

        {/*
          What to eat instead.

          A client who cannot face the planned lunch will substitute something
          whether or not the plan says so, and the plan is the right place for
          that decision to have been made by a dietitian. Each carries its own
          calories so a swap is visibly a swap rather than a guess.
        */}
        {meal.alternatives.length > 0 && (
          <p className="plan-print-alts">
            {/* The trailing space is markup, not CSS. The label's own
                `margin-inline-end` gives it room when the print sheet is
                rendered by a browser, but Word applies no margin to an inline
                span — and without a real character the label runs straight into
                the first name in the `.doc`. */}
            <span className="plan-print-alts-label">{tPrint('alternatives')}</span>{' '}
            {meal.alternatives.map((alternative, index) => (
              <Fragment key={alternative.id}>
                {index > 0 && <span className="plan-print-sep"> · </span>}
                <span className="plan-print-alt" dir="auto">
                  {alternative.name}{' '}
                  <span className="plan-print-alt-kcal">
                    {t('kcalValue', { value: alternative.kcal })}
                  </span>
                </span>
              </Fragment>
            ))}
          </p>
        )}
      </td>

      <td className="plan-print-meal-kcal">{t('kcalValue', { value: meal.kcal })}</td>
    </tr>
  );
}

/**
 * A `YYYY-MM-DD` as a reader's date.
 *
 * Built at local midnight rather than parsed as an instant, for the reason
 * `week.ts` is string-in and string-out throughout: `new Date('2026-08-30')` is
 * UTC midnight, which is the 29th anywhere west of Greenwich.
 */
function printedDate(
  format: ReturnType<typeof useFormatter>,
  date: string,
  month: 'long' | 'short',
): string {
  return format.dateTime(new Date(`${date}T00:00:00`), {
    day: 'numeric',
    month,
    ...(month === 'long' ? { year: 'numeric' } : {}),
  });
}
