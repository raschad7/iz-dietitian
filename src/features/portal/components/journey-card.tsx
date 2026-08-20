import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getMascotProgression, type MascotState } from '@/features/portal/mascot/states';
import { type Locale } from '@/i18n/routing';
import { formatPercent } from '@/lib/format';

import { ProgressMascot } from './progress-mascot';

/**
 * "رحلتك" — the week's adherence as a character, a sentence and a bar.
 *
 * **The same reading on both tabs.** Home and Progress each hand this the
 * fraction `journeyFractionOf` returned for their own page load, and that
 * function is a single expression over `WeekAdherence.averageFraction` — the
 * figure `summariseAdherenceWeek` already produces for the week strip and the
 * trend. There is no second arithmetic here and no rounding that could make the
 * two screens disagree: 68% on one is 68% and state 4 on the other.
 *
 * **A server component.** Only `ProgressMascot` inside it is client code, for
 * the celebration record it has to read and the swap it has to time. The
 * heading, the sentence, the bar and the percentage are all rendered on the
 * server, so the text a client reads is present in the first paint rather than
 * after hydration — which also means the accessible content of this card does
 * not depend on JavaScript running at all.
 */

/**
 * State → the sentence beside it.
 *
 * A table rather than a computed key, so a missing translation is a build-time
 * type error rather than a raw `journey.message.state7` printed onto the card.
 *
 * ⚠ **Every one of these is about the plan, never about the client's body.**
 * §14 and §24 of the brief: the tone is supportive, the subject is what the
 * client did this week, and there is nothing here that could read as a comment
 * on how they look. The state-1 line in particular is an invitation, not a
 * verdict — it is what a client sees before they have ticked anything, which is
 * the single most common reading of this card.
 *
 * `as const satisfies` rather than an annotation: the `satisfies` half is what
 * makes a missing state an error, and the `as const` half is what keeps the
 * values literal so `next-intl`'s typed `t()` can check each key against the
 * message catalogue. Annotating this `Record<MascotState, string>` widens them
 * to `string` and quietly gives up that second check.
 */
const MESSAGE_KEYS = {
  1: 'message.start',
  2: 'message.building',
  3: 'message.consistent',
  4: 'message.progressing',
  5: 'message.closer',
  6: 'message.almost',
} as const satisfies Record<MascotState, string>;

export function JourneyCard({
  /** The week's average adherence, 0–1, or null when nothing is reported yet. */
  fraction,
  /**
   * The ISO date the week starts on. Two jobs: it scopes the "already
   * celebrated" record so next week can be celebrated afresh, and it is what
   * makes a rollover reset the card rather than carry Sunday's confetti into
   * Monday. See `use-mascot-progression.ts`.
   */
  weekStartDate,
  locale,
}: {
  fraction: number | null;
  weekStartDate: string;
  locale: Locale;
}) {
  const t = useTranslations('portal.journey');

  const { state, complete } = getMascotProgression(fraction);

  /*
    Three readings, three sentences. "Nothing reported yet" is its own line
    rather than the state-1 message, because a week not started and a week
    started badly deserve different words even though they earn the same
    drawing — the drawing is a picture of where the client is, and this is the
    app speaking to them.
  */
  const message = fraction === null ? t('message.empty') : complete ? t('message.complete') : t(MESSAGE_KEYS[state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4">
        <ProgressMascot progress={fraction} scope={weekStartDate} size="md" />

        <p className="text-center text-sm text-balance text-muted-foreground">{message}</p>

        {/*
          The bar carries the number, and the number is what makes the mascot
          decorative — see the `alt` note in `ProgressMascot`. `aria-label` on
          the track rather than a visible label above it: the card's own title
          already names what is being measured, and a second heading inside it
          would be the third time this card says "this week".

          `value` is rounded for the bar and the printed figure is not, which is
          deliberate — a bar is a picture and a percentage is a fact. An
          unreported week draws an empty track rather than no track at all, so
          the card keeps its shape from Sunday through Saturday.
        */}
        <div className="flex w-full items-center gap-3">
          <Progress
            value={fraction === null ? 0 : Math.round(fraction * 100)}
            aria-label={t('barLabel')}
            className="flex-1"
          />
          <span className="w-12 shrink-0 text-end text-sm font-medium tabular-nums">
            {fraction === null ? '—' : formatPercent(locale, fraction, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
