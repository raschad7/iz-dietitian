import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { type TodayAdherence } from '@/features/portal/adherence';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

import { TodayRing } from './today-ring';

/**
 * "التزامك اليوم" — today's own report, read rather than written here.
 *
 * The ring is `TodayRing`, the exact one the home screen's commitment card
 * draws — same dashed track, same fill disc, same `portal-progress-*`
 * tokens — not a second design that happened to agree with it. One client
 * reading the same percentage on two screens should see it drawn the same
 * way both times. `showMealsCaption={false}`: this card already states the
 * meal count in its own encouragement line below, so the ring here carries
 * only the figure.
 *
 * **It reads a percentage, not a score.** The number in the middle was a score
 * out of ten that only ever showed 0, 5 or 10, because a three-level `level`
 * was all it had: two meals of four and three of four both printed "5 من ١٠".
 * It now prints the exact fraction of today's meals ticked — 25%, 33%, 75% —
 * and the ring is drawn to the same number the client can count themselves.
 *
 * There used to be a three-way segmented control here — "missed" / "partial"
 * / "full" — for the client to pick themselves. It is gone: adherence is
 * derived from how many of today's meals are ticked on the meal-plan screen
 * (see `client-plan-adherence.ts` and `toggleMealCompletion`), so a client
 * reporting on their own day and the plan they actually followed could
 * silently disagree. The card now only reads that derived figure and points
 * at the one place it can still be changed — ticking meals.
 */

export function TodayAdherenceCard({ today, locale }: { today: TodayAdherence | null; locale: Locale }) {
  const t = useTranslations('portal.progress.today');

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        {/*
          Ring beside the words, and stacked under them on the narrowest phones.

          The ring is `size-44` — 176px — and `shrink-0`, which is right: it is
          the figure the client opened the tab to read and it must not be
          squeezed into an ellipse. But at 320px the card's content box is about
          256px, so the ring and the `gap-4` took 192 of it and left 64px for
          the heading beside it. "Today's progress" does not fit in 64px; it was
          clipped to a couple of characters, and the encouragement line under it
          with it.

          Stacking below 400px gives both the full width in turn and loses
          nothing — the same ring, the same heading, the same sentence, in one
          column instead of two, centred so the ring stays the anchor. From
          400px up, where the text column is wide enough to read, the row is
          exactly as it was.
        */}
        <div className="flex items-center gap-4 max-[25rem]:flex-col max-[25rem]:text-center">
          {/*
            `countOnMount`: this figure is what the client opened the tab to
            read, and it does not move while they are reading it — there are no
            meals to tick on this screen. So the ring draws itself up from zero
            on arrival instead of appearing already finished. The home screen's
            copy deliberately does not, because a day switch remounts it there
            and the climb would read as that day's figure having just been
            earned — see `rising-fraction.ts`.
          */}
          <TodayRing
            fraction={today?.fraction ?? null}
            completed={today?.completedMeals ?? 0}
            total={today?.totalMeals ?? 0}
            locale={locale}
            showMealsCaption={false}
            countOnMount
          />

          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="font-heading text-lg leading-snug font-medium">{t('heading')}</h2>
            {/*
              The one thing on this card that still reads the level rather
              than the number: encouragement is a sentence, and there is no
              way to write one per percentage. It never contradicts the ring —
              both come off the same row.
            */}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {today ? t(`level.${today.level}`) : t('prompt')}
            </p>
          </div>
        </div>

        {/*
          `/portal`, not `/${locale}/portal`: `Link` here is the locale-aware
          one from `@/i18n/navigation`, which prefixes the active locale
          itself — see the same pattern in `pending-requests-card.tsx`. The
          plan now lives on the home screen itself, below today's progress,
          rather than its own tab.
        */}
        <Link href="/portal" className={buttonVariants({ variant: 'outline', className: 'w-full max-w-none' })}>
          {t('cta')}
          <Icon name="chevronEnd" />
        </Link>
      </CardContent>
    </Card>
  );
}
