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
          No `countOnMount`: this used to draw the figure up from zero every
          time the tab was opened, the same entrance the progress ring gets
          on arrival — but unlike that ring, this card is revisited constantly
          as a client switches tabs, and replaying a multi-second count-up on
          every single visit reads as the app re-announcing a number it
          already told you, not as a fresh achievement. The home screen's own
          mascot never counts on mount either (see `TodayEnergyMascot`'s call
          site), so leaving this at the hook's own default — paint the real
          figure immediately, animate only when it later moves — is what
          keeps the two screens' character in step rather than one of them
          performing and the other not. The narrow-phone stacking is
          `TodayMascotFigure`'s own concern now that the heading and level
          sentence render inside it.

          The level sentence is still the one thing here that reads the level
          rather than the number: encouragement is a sentence, and there is no
          way to write one per percentage. It never contradicts the figure
          above it — both come off the same `today`.
        */}
        <TodayMascotFigure
          fraction={today?.fraction ?? null}
          locale={locale}
          heading={t('heading')}
          levelText={today ? t(`level.${today.level}`) : t('prompt')}
        />

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
