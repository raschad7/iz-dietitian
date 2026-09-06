import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

import { delta, isNotable, type Delta } from '../period';

/**
 * One figure, what it was last period, and whether that is good news.
 *
 * ## Why the delta is the point
 *
 * The panel this replaces printed twenty-seven live counts and no baselines. A
 * count with nothing beside it cannot be acted on — "41 plans" is neither good
 * nor bad, it is a number, and the operator has to remember last week to make
 * anything of it. Every card here carries the equally-long previous window, so
 * the screen answers "is this normal" rather than "what is this".
 *
 * ## Direction is not the same as good
 *
 * `polarity` is what separates them, and it exists because half these figures
 * are inverted: more clinics joining is good and more model calls failing is
 * not, and a card that tints every rise green would celebrate an outage. The
 * default is `up-is-good`; failures and disabled accounts pass `up-is-bad`, and
 * a figure that is neither passes `neutral` and gets the muted treatment in
 * both directions.
 *
 * ## A rise from nothing shows a count, not a percentage
 *
 * Going from 0 to 5 is not a 500% increase and not an infinite one. `delta`
 * returns a null ratio there and this renders the absolute change instead. Every
 * dashboard that prints "+∞%" in that spot is lying about its arithmetic.
 *
 * ## Small movements do not shout
 *
 * On a deployment with three clinics, one joining is +33%. Below
 * `NOTABLE_CHANGE` the chip stays muted — still shown, because hiding a real
 * change is worse, but not coloured as though something happened.
 *
 * ## How the card is laid out, and why it was rebuilt
 *
 * The first version stacked four things in one column — label, figure, a wrapped
 * row of "↗ 17 · vs 0", and a hint — with `mt-auto` shoving the middle row to
 * the floor. In a grid of four cards of different content lengths that put the
 * figure and its own comparison at opposite ends of the card, with the delta and
 * the baseline running together as one grey sentence that had to be *read* to be
 * understood. Three changes fix it:
 *
 * **The figure is the size of a figure.** `text-display-sm` (32px) against the
 * label's 13px, rather than 24px against 14px. A metric card exists to be read
 * across a room's worth of screen; at one step of separation it read as a
 * heading with a caption.
 *
 * **The delta is a chip, not a sentence.** It carries its tone as a tinted pill
 * with the arrow inside it, so the eye finds "is this up or down" as a *shape*
 * before reading a digit.
 *
 * **The chip sits in the label row, not beside the figure.** It was beside it
 * first, which is where it belongs conceptually and where it does not fit: six
 * of these across a 1600px screen leaves each card about 250px, and
 * `US$ 0.0286` at 32px plus a chip is wider than that — so the chip wrapped
 * under the figure on the money cards and sat beside it on the count cards, and
 * a row of six had its numbers on three different baselines. In the label row it
 * cannot collide with anything, and every figure in the row starts at the same
 * height whatever it says.
 *
 * **The baseline moves under both**, as its own quiet line, so "vs 0" is
 * legible as a footnote rather than as more of the chip.
 *
 * The optional `icon` is the fourth: a metric grid where every card opens with
 * the same weight of text is a grid you count your way through. The glyph is
 * decorative — the label says what the figure is — and it inherits the card's
 * hover response the way `CardTitle`'s does.
 */

export type MetricPolarity = 'up-is-good' | 'up-is-bad' | 'neutral';

type MetricCardProps = {
  label: string;
  value: number;
  /** The same measure over the previous window. `null` disables the comparison. */
  previous?: number | null;
  locale: Locale;
  polarity?: MetricPolarity;
  /** A second line under the figure — a total the window is a slice of. */
  hint?: string;
  /** Makes the whole card a link to the screen that explains it. */
  href?: string;
  /** Formats the figure as something other than a plain count — money, a duration. */
  format?: (value: number) => string;
  /** A decorative glyph in the label row, so a grid of cards is scannable. */
  icon?: IconName;
};

/** Which way a change should be read. */
function toneOf(change: Delta, polarity: MetricPolarity): 'good' | 'bad' | 'flat' {
  if (polarity === 'neutral' || change.direction === 'flat' || change.direction === 'unknown') {
    return 'flat';
  }

  const good = polarity === 'up-is-good' ? change.direction === 'up' : change.direction === 'down';

  return good ? 'good' : 'bad';
}

export async function MetricCard({
  label,
  value,
  previous = null,
  locale,
  polarity = 'up-is-good',
  hint,
  href,
  format,
  icon,
}: MetricCardProps) {
  const t = await getTranslations('admin.metrics');
  const change = delta(value, previous);
  const tone = toneOf(change, polarity);
  const notable = isNotable(change);

  /*
    The delta chip. Rendered once and placed in the label row rather than beside
    the figure — see the layout note above for why that had to move.
  */
  const chip =
    change.change === null ? null : (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-caption font-medium tabular-nums',
          !notable || tone === 'flat'
            ? 'bg-muted text-muted-foreground'
            : tone === 'good'
              ? 'bg-status-on-track-bg text-status-on-track-fg'
              : 'bg-status-attention-bg text-status-attention-fg',
        )}
        dir="ltr"
      >
        {/*
          An arrow as well as a colour. Colour is never the only carrier of
          status — see the accessibility floor in docs/design-system.md — and
          this chip is read at 12px where a green and an amber are not
          reliably distinguishable anyway.
        */}
        {change.direction !== 'flat' ? (
          <Icon
            name={change.direction === 'up' ? 'driftUp' : 'driftDown'}
            className="size-3 shrink-0"
            aria-hidden
          />
        ) : null}

        {change.ratio === null
          ? // A rise from zero. The count is the only honest statement.
            `${change.change > 0 ? '+' : ''}${formatNumber(locale, change.change)}`
          : formatPercent(locale, change.ratio, {
              signDisplay: 'exceptZero',
              maximumFractionDigits: 0,
            })}
      </span>
    );

  const body = (
    <CardContent className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-label font-medium text-muted-foreground">
          {icon ? (
            <Icon
              name={icon}
              className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/card:text-primary"
              aria-hidden
            />
          ) : null}
          <span className="min-w-0 truncate">{label}</span>
        </p>

        {chip}
      </div>

      <p className="font-heading text-display-sm leading-none font-semibold tabular-nums" dir="ltr">
        {format ? format(value) : formatNumber(locale, value)}
      </p>

      {/*
        The footnotes, pinned to the floor of the card so a row of cards with
        different amounts to say still lines its figures up on one baseline.
      */}
      <div className="mt-auto space-y-0.5 pt-1">
        {change.change === null ? (
          /*
            No previous window — the range is "all", so there is nothing before
            it. Saying so beats an empty space the reader has to interpret, and
            beats a "0%" that would claim the figure held steady.
          */
          <p className="text-caption text-muted-foreground">{t('noBaseline')}</p>
        ) : change.previous !== null ? (
          <p className="text-caption text-muted-foreground">
            {t('previous', { value: formatNumber(locale, change.previous) })}
          </p>
        ) : null}

        {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
      </div>
    </CardContent>
  );

  if (!href) return <Card className="h-full">{body}</Card>;

  return (
    <Card className="h-full transition-[box-shadow] duration-(--duration-label) hover:ring-primary">
      <Link
        href={href}
        className="block h-full rounded-[inherit] outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    </Card>
  );
}

/**
 * A figure with no comparison — a standing total rather than a windowed count.
 *
 * Deliberately a different component and not a `previous`-less `MetricCard`:
 * "17 clinics" and "3 joined this week" are different kinds of statement, and
 * giving them the same frame invites the reader to look for a delta on the one
 * that cannot have one. This is smaller, and it sits in a row of its own.
 */
export function Standing({
  label,
  value,
  locale,
  tone,
}: {
  label: string;
  value: number;
  locale: Locale;
  /** `attention` for the figures that mean something is wrong when non-zero. */
  tone?: 'attention';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <dt className="text-body-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-heading text-body-lg font-semibold tabular-nums',
          tone === 'attention' && value > 0 && 'text-status-attention-fg',
        )}
        dir="ltr"
      >
        {formatNumber(locale, value)}
      </dd>
    </div>
  );
}
