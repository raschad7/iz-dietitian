import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { type TodayAdherence } from '@/features/portal/adherence';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

import { TodayMascotFigure } from './today-mascot-figure';

/**
 * "التزامك اليوم" — today's own report, read rather than written here.
 *
 * **The character, not the ring.** `TodayRing` — the dashed track and fill
 * disc the home screen's own commitment card still draws — is deliberately
 * not reused here: this card reads it through `TodayMascotFigure` instead,
 * the reactive mark beside the exact percentage rather than inside a ring
 * around it. The two cards are allowed to disagree on the picture because
 * they are answering different questions — the home screen's ring is a dial
 * a client watches move meal by meal; this one is a report the client opens
 * the tab to read once, and reads better as "here's how your character is
 * doing today, and here's the number" than as a second dial. Both still draw
 * from the exact same `today.fraction`, so the two screens can never disagree
 * about the figure itself, only the way it is pictured.
 *
 * **It reads a percentage, not a score.** The number was a score out of ten
 * that only ever showed 0, 5 or 10, because a three-level `level` was all it
 * had: two meals of four and three of four both printed "5 من ١٠". It now
 * prints the exact fraction of today's meals ticked — 25%, 33%, 75%.
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
          Character and figure beside the words, and stacked under them on the
          narrowest phones.

          At 320px the card's content box is about 256px, so the figure and
          the `gap-4` take most of it and leave too little for the heading
          beside it to read as more than a couple of clipped characters — the
          same problem the ring this replaced had at that width, and the same
          fix: stacking below 400px gives both the full width in turn, centred
          so the character stays the anchor. From 400px up, where the text
          column is wide enough to read, the row is side by side.
        */}
        <div className="flex items-center gap-4 max-[25rem]:flex-col max-[25rem]:text-center">
          {/*
            `countOnMount`: this figure is what the client opened the tab to
            read, and it does not move while they are reading it — there are no
            meals to tick on this screen. So the number draws itself up from
            zero on arrival instead of appearing already finished — see
            `rising-fraction.ts`.
          */}
          <TodayMascotFigure fraction={today?.fraction ?? null} locale={locale} countOnMount />

          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="font-heading text-lg leading-snug font-medium">{t('heading')}</h2>
            {/*
              The one thing on this card that still reads the level rather
              than the number: encouragement is a sentence, and there is no
              way to write one per percentage. It never contradicts the
              figure — both come off the same row.
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
