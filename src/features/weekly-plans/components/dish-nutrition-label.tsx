'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { energySplit, NUTRIENT_UNITS, roundForDisplay, type NutrientTotals } from '../nutrition';

/**
 * One colour per macro — protein blue, carbohydrate gold, fat lavender.
 *
 * The values live in `globals.css` as `--macro-*`, and the note there carries
 * the reasoning: they sit a lightness step above every dish-property dot, so a
 * ring segment cannot be misread as one more property of the dish. Nothing in
 * this file picks a colour; it only says which macro wears which token.
 */
export const MACRO_STYLE = {
  protein: { fill: 'bg-macro-protein', stroke: 'stroke-macro-protein' },
  carbs: { fill: 'bg-macro-carbs', stroke: 'stroke-macro-carbs' },
  fat: { fill: 'bg-macro-fat', stroke: 'stroke-macro-fat' },
} as const;

const MACRO_KEYS = ['protein', 'carbs', 'fat'] as const;

/**
 * Ring geometry, in two sizes.
 *
 * `gap` is the sliver of track left between two arcs, so a 3% segment beside a
 * 60% one still reads as its own mark rather than as a colour change part-way
 * along one long stroke.
 */
const RING = {
  wide: { size: 190, stroke: 18 },
  narrow: { size: 118, stroke: 13 },
  gap: 3,
} as const;

/**
 * The dish's nutrition, as a label rather than a row of numbers.
 *
 * One ring carrying the energy split, the calorie figure inside it, and the
 * three macros spelled out beside it in grams and per cent. Everything here is
 * derived from the recipe by `dishTotals` — nothing on this surface can be
 * typed, which is what stops a dish claiming a protein count its foods do not
 * support.
 *
 * **What is entered is one serving, and there is no serving count.** The recipe
 * a dietitian types here is the plate they hand a client — the field that asked
 * how many people the pot fed is gone. It divided every figure on this label by
 * a number that was 1 in nearly every dish, so its whole visible effect was to
 * make the reader wonder which of the numbers in front of them it had already
 * touched; and a dish that is genuinely a pot is entered as a pot's worth of one
 * plate, which is the same arithmetic done once, by the person who knows the
 * recipe.
 *
 * The two figures at the foot are the ones that do change how a dish is read:
 * what a serving weighs, and what it costs per 100 g — the only basis on which
 * two dishes are actually comparable.
 */
export function DishNutritionLabel({
  totals,
  empty,
  categoryLabel,
  totalGrams,
  stacked = false,
}: {
  /** Totals for the dish as entered — one serving. */
  totals: NutrientTotals;
  empty: boolean;
  /** The derived category — "high protein", "balanced" — already translated. */
  categoryLabel: string;
  /** What the serving weighs, for the summary line. */
  totalGrams: number;
  /** Ring above the macros rather than beside them, for a narrow column. */
  stacked?: boolean;
}) {
  const t = useTranslations('dishEditor.editor');
  const tNutrients = useTranslations('weeklyPlans.nutrients');

  const split = energySplit(totals);
  const ring = stacked ? RING.narrow : RING.wide;
  const kcalPer100g = totalGrams > 0 ? Math.round((totals.kcal.value / totalGrams) * 100) : 0;

  return (
    /* `h-full` on both steps: this card is what makes its column end level with
       the one beside it — the recipe on step 2, the two label panels on step 3. */
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xs">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-label font-medium">{t('nutritionTitle')}</h3>
        {!empty && (
          <Badge variant="muted" size="sm">
            {categoryLabel}
          </Badge>
        )}
      </div>

      {empty ? (
        <p className="flex flex-1 items-center justify-center px-4 py-10 text-center text-body-sm text-muted-foreground">
          {t('nutritionEmpty')}
        </p>
      ) : (
        <div
          className={cn(
            'flex flex-1 items-center justify-center gap-4 px-4 py-4 sm:gap-5',
            stacked ? 'flex-col' : 'flex-col sm:flex-row',
          )}
        >
          <EnergyRing
            split={split}
            size={ring.size}
            stroke={ring.stroke}
            kcal={roundForDisplay('kcal', totals.kcal.value)}
            caption={t('perServingShort')}
            label={(key) => tNutrients(key)}
          />

          <dl className="w-full min-w-0 flex-1 space-y-3.5">
            {MACRO_KEYS.map((key) => {
              const percent = Math.round(split[key].percent * 100);

              return (
                <div key={key}>
                  <div className="mb-1.5 flex items-baseline gap-2 text-caption">
                    <span
                      aria-hidden
                      className={cn('size-2.5 shrink-0 rounded-full', MACRO_STYLE[key].fill)}
                    />
                    <dt>{tNutrients(key)}</dt>
                    <dd className="ms-auto font-medium tabular-nums" dir="ltr">
                      {roundForDisplay(key, totals[key].value)}
                      <span className="ms-0.5 text-muted-foreground">{NUTRIENT_UNITS[key]}</span>
                    </dd>
                    <span className="w-9 text-end tabular-nums text-muted-foreground" dir="ltr">
                      {percent}%
                    </span>
                  </div>
                  <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[inline-size] duration-300 ease-out',
                        MACRO_STYLE[key].fill,
                      )}
                      style={{ inlineSize: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {/*
        The two figures a dish is judged on, once the ring has said what it is
        made of: what one serving weighs, and its energy density. Per 100 g is
        the only footing on which two dishes compare — 300 kcal of soup and 300
        kcal of pastry are not the same dish — and it costs nothing to print,
        since the grams and the calories are both already here.
      */}
      {!empty && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-muted/40 px-4 py-2.5 text-caption text-muted-foreground">
          <span className="tabular-nums" dir="auto">
            {t('gramsPerServing', { grams: Math.round(totalGrams) })}
          </span>
          <span className="tabular-nums" dir="auto">
            {t('kcalPer100g', { kcal: kcalPer100g })}
          </span>
        </div>
      )}

    </section>
  );
}

/**
 * The energy split as one ring.
 *
 * Three arcs laid end to end around the same circle, sized by each macro's share
 * of the energy rather than its grams — nine calories of fat and four of protein
 * are not the same gram. Drawn with `stroke-dasharray` on three concentric
 * circles rather than paths: the arithmetic is one multiplication per macro, and
 * there is no arc-flag arithmetic to get wrong at 99%.
 *
 * `aria-hidden`, because the same numbers are printed as a definition list
 * immediately beside it — a screen reader reading the ring as well would say
 * everything twice.
 */
function EnergyRing({
  split,
  size,
  stroke,
  kcal,
  caption,
  label,
}: {
  split: ReturnType<typeof energySplit>;
  size: number;
  stroke: number;
  kcal: number;
  caption: string;
  label: (key: (typeof MACRO_KEYS)[number]) => string;
}) {
  const center = size / 2;
  const radius = center - stroke / 2 - 1;
  const circumference = 2 * Math.PI * radius;

  /*
   * The three arcs, each starting where the previous one ended. Built as one
   * derivation before the JSX rather than by advancing a counter inside the map:
   * a variable reassigned during render is a variable whose value depends on how
   * many times React chose to render.
   */
  const arcs = MACRO_KEYS.reduce<
    { key: (typeof MACRO_KEYS)[number]; length: number; start: number }[]
  >((acc, key) => {
    const previous = acc.at(-1);
    const start = previous ? previous.start + previous.length : 0;
    return [...acc, { key, length: circumference * split[key].percent, start }];
  }, []);

  return (
    <div className="relative shrink-0" style={{ inlineSize: size, blockSize: size }}>
      <svg aria-hidden viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        {arcs.map(({ key, length, start }) => {
          // A segment shorter than the gap would render as a backwards dash.
          const drawn = Math.max(0, length - RING.gap);

          return (
            <circle
              key={key}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeDasharray={`${drawn} ${circumference - drawn}`}
              strokeDashoffset={-start}
              className={cn(
                'transition-[stroke-dasharray] duration-300 ease-out',
                MACRO_STYLE[key].stroke,
              )}
            >
              <title>{label(key)}</title>
            </circle>
          );
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-heading text-heading-lg font-medium tabular-nums" dir="ltr">
          {kcal}
        </span>
        <span className="text-caption text-muted-foreground">{caption}</span>
      </div>
    </div>
  );
}
