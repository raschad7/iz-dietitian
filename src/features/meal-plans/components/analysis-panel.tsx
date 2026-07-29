'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import {
  MACRO_KEYS,
  NUTRIENT_KEYS,
  NUTRIENT_UNITS,
  energySplit,
  roundForDisplay,
  type NutrientTotals,
} from '@/features/meal-plans/nutrition';
import { formatNumber, formatPercent } from '@/lib/format';
import { type Locale } from '@/i18n/routing';

/**
 * The analysis half of the workspace.
 *
 * One component for all three scopes — week, day and meal — because the totals
 * at every level are the same shape. Only the heading and the hint change; the
 * caller decides which level is in focus and hands over the matching totals.
 */
export function AnalysisPanel({
  locale,
  totals,
  scope,
  itemCount,
}: {
  locale: Locale;
  totals: NutrientTotals;
  /** The open day's or selected meal's name; null for the whole week. */
  scope: string | null;
  itemCount: number;
}) {
  const t = useTranslations('mealPlans');
  const split = energySplit(totals);

  return (
    <div className="space-y-5 rounded-lg border border-border p-4 text-start">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('analysis.title')}</h3>
          <Badge variant={scope ? 'default' : 'muted'}>{scope ?? t('analysis.wholeWeek')}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {scope ? t('analysis.scopedHint') : t('analysis.weekHint')}
        </p>
      </div>

      {/* The headline number. Everything below it is detail. */}
      <div>
        <p className="text-3xl font-semibold tabular-nums" dir="ltr">
          {formatNumber(locale, roundForDisplay('kcal', totals.kcal.value))}
        </p>
        <p className="text-xs text-muted-foreground">{t('analysis.energy')}</p>
      </div>

      {itemCount === 0 ? (
        <p className="text-sm text-muted-foreground">{t('analysis.empty')}</p>
      ) : (
        <>
          {/*
           * Three labelled meters rather than one colour-coded stacked bar.
           *
           * This design system is deliberately achromatic — every `--chart-*`
           * token has zero chroma — so there is no categorical palette able to
           * tell three series apart by hue. Splitting them into named rows makes
           * the label carry identity, which is both simpler and readable for a
           * colourblind user, rather than inventing brand colours the rest of
           * the app does not use.
           */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground">{t('analysis.macroSplit')}</h4>

            {MACRO_KEYS.map((key) => (
              <div key={key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">{t(`nutrients.${key}`)}</span>
                  <span className="tabular-nums text-muted-foreground" dir="ltr">
                    {formatNumber(locale, roundForDisplay(key, split[key].grams))} g ·{' '}
                    {formatPercent(locale, split[key].percent)}
                  </span>
                </div>

                {/*
                 * Track and fill. Sized with `inline-size`, not `width`, so the
                 * bar grows from the reading edge and mirrors itself in Arabic.
                 */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/70"
                    style={{ inlineSize: `${(split[key].percent * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
            ))}

            <p className="text-[0.7rem] leading-snug text-muted-foreground">{t('analysis.macroSplitNote')}</p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">{t('analysis.allNutrients')}</h4>

            <table className="w-full border-collapse text-xs">
              <tbody>
                {NUTRIENT_KEYS.map((key) => (
                  <tr key={key} className="border-t border-border/60">
                    <td className="py-1.5 text-start">{t(`nutrients.${key}`)}</td>
                    <td className="py-1.5 text-end tabular-nums" dir="ltr">
                      {formatNumber(locale, roundForDisplay(key, totals[key].value))} {NUTRIENT_UNITS[key]}
                      {/*
                       * A nutrient nobody measured for some of these foods is a
                       * floor, not a total. Saying so is the difference between
                       * a number and a misleading number.
                       */}
                      {totals[key].unmeasured > 0 ? (
                        <span
                          className="ms-1 cursor-help text-muted-foreground"
                          title={t('analysis.unmeasured', { count: totals[key].unmeasured })}
                        >
                          *
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-[0.7rem] leading-snug text-muted-foreground">{t('analysis.unmeasuredNote')}</p>
          </div>
        </>
      )}
    </div>
  );
}
