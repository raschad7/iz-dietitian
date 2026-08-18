import { useTranslations } from 'next-intl';

import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * One measured fact from the health record, as a tile.
 *
 * `kind` is what the value *is*, not how it should look — a category is a word
 * from a known few, a measurement is a quantity you compare against another
 * one. Only the second gets tabular digits and a unit under it; both are drawn
 * in the same ink, at the same weight, one step apart on the scale. Deciding it
 * per value would leave the grid styled wherever the caller felt like it.
 */
export type HealthStat = {
  label: string;
  /** `null` renders the tile in its unrecorded state — never invented to fill it. */
  value: string | null;
  /** The unit, shown under the figure. `measure` only; a category has none. */
  unit?: string;
  kind: 'measure' | 'category';
  icon: IconName;
};

/**
 * The health record's headline facts, as a row of tiles rather than a ruled list.
 *
 * **Why a grid here and a list everywhere else on this screen.** These are the
 * short answers — a number and a unit, or one word from a known set — and they
 * are what a client opens this screen to check. The prose fields below
 * (conditions, allergies, medications, the dietitian's note) stay a list,
 * because a paragraph in a third-width tile is three words wide.
 *
 * **One tone, and the glyph carries the difference.** The reference design gave
 * each tile its own hue — green, blue, purple. This palette has no purple and
 * §Colour rules out blue outright, and the two support hues it does have are
 * spoken for: amber means "needs follow-up" and clay is the only alarm colour,
 * so a height drawn in either would be saying something about the height. The
 * tiles are therefore one olive tint apiece with a distinct glyph, which is the
 * same trade the meal cards make and for the same reason.
 *
 * **An unrecorded tile is dashed and says so.** `Card variant="empty"` is the
 * system's "a space waiting to be filled" (§Cards) and it is exactly right here:
 * a client whose height has never been taken should see a gap that reads as a
 * gap, not a filled tile with a grey word in it that looks like data. The value
 * is never invented, and "not recorded" is a state rather than an empty string —
 * the same contract `InfoRow` holds.
 */
export function HealthStats({ stats }: { stats: readonly HealthStat[] }) {
  const t = useTranslations('portal.profile');

  /*
    The column count follows the tile count so a row is never left half-empty.
    Three is the ordinary case — height, goal, activity — and three at two-up
    put one tile alone beside a hole, which reads as a tile that failed to load
    rather than as a set that ended. A fourth, the weight when the dietitian
    shares it, squares off into two rows of two instead of three-plus-one, and
    only spreads across a single row once `sm` has the width for it.
  */
  /*
    Three across, except on the phones where three across does not fit.

    The three-up case had no breakpoint at all, so it stayed three-up at every
    width down to 320px — where each tile is about 82px and a value like
    "Moderately active" or its Arabic equivalent ran straight out of its tile
    and over the neighbour's. Two-up below 380px gives each tile half the row,
    which is enough for the longest category either locale produces, and the odd
    third tile takes the second row.

    The four-tile case already stepped down to two and is left alone: at four,
    two-up is the *narrow* arrangement and it holds at 320px.
  */
  const columns =
    stats.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 min-[24rem]:grid-cols-3';

  /*
    **The odd tile takes the whole second row rather than half of it.**

    Stepping three tiles down to two columns below `24rem` fixed the values
    running out of their tiles, but it left the third one alone beside an empty
    half — the exact "a tile that failed to load" reading the three-up case was
    arranged to avoid, moved from the desktop width to the phone width. Spanning
    it closes the hole, and a full-width tile among two half-width ones reads as
    the set ending rather than as one going missing.

    Only when there are three: at four the grid is even at both counts, and the
    span is undone at `min-[24rem]` where all three fit on one row again.
  */
  const lastSpan = stats.length === 3 ? 'col-span-2 min-[24rem]:col-span-1' : undefined;

  return (
    /*
      `<div>` between `<dl>` and its `<dt>`/`<dd>` is valid HTML5 grouping, which
      is what lets each pair be its own tile without giving up the description
      list semantics a screen reader reads this by.

      Three across a 375px screen leaves each tile about 98px wide, so the phone
      gets a tighter tile — smaller disc, smaller label, less inset — and the
      full-size one returns at `sm`. Shrinking the tile is what buys the row;
      keeping the desktop tile and letting it wrap is what created the hole.
    */
    <dl className={cn('grid gap-2 sm:gap-3', columns)}>
      {stats.map((stat, index) => {
        const empty = stat.value === null || stat.value.trim() === '';

        return (
          <Card
            key={stat.label}
            variant={empty ? 'empty' : 'tile'}
            className={cn(
              'items-center gap-1.5 p-3 text-center sm:gap-2 sm:p-4',
              index === stats.length - 1 && lastSpan,
            )}
          >
            {/*
              The badge is the tile's mark: a disc of the brand's quiet fill with
              the glyph in primary on it. On an unrecorded tile it drops to the
              muted pair, so the whole tile reads as one state rather than as a
              live icon sitting above a dead value.
            */}
            <span
              aria-hidden
              className={
                empty
                  ? 'grid size-9 place-items-center rounded-full bg-muted text-muted-foreground sm:size-11'
                  : 'grid size-9 place-items-center rounded-full bg-icon-chip text-icon-chip-foreground sm:size-11'
              }
            >
              <Icon name={stat.icon} className="size-4.5 sm:size-5.5" />
            </span>

            <dt
              className={
                empty
                  ? 'text-xs leading-snug text-balance sm:text-sm'
                  : 'text-xs leading-snug text-balance text-muted-foreground sm:text-sm'
              }
            >
              {stat.label}
            </dt>

            <dd className="min-w-0">
              {empty ? (
                <span className="text-xs sm:text-sm">{t('notRecorded')}</span>
              ) : stat.kind === 'category' ? (
                /*
                  **A stated value, not a pill.**

                  It was a default `Badge` — olive label on the brand's subtle
                  fill. Two problems with that on this grid. The pill is a
                  *chip*, and a chip beside two tiles whose values are bare
                  figures made the goal and the activity level look like a
                  different class of fact — something tagged rather than
                  something measured. And it was the only olive text in the
                  three tiles, which on a screen with no status to report read
                  as the record's one coloured judgement.

                  So a category is now drawn the way a measurement is: the
                  heading face, semibold, in full-strength ink, with nothing
                  behind it. It sits one step down the scale from a figure
                  because "زيادة الوزن" is two words where "170" is three
                  digits, and `text-balance` splits those two words evenly
                  rather than leaving one alone on the second line.
                */
                <span className="block font-heading text-sm leading-snug font-semibold text-balance sm:text-base">
                  {stat.value}
                </span>
              ) : (
                /*
                  **The figure and its unit on one line** — `188 سم`, not `188`
                  stacked over `سم`.

                  The unit sat under the number, which is the reference design's
                  drawing and is right on a dashboard tile the size of a card.
                  At a third of a phone's width it is not: the tile is already
                  three short lines tall (glyph, label, value), and splitting the
                  one line anybody reads into two made this tile taller than the
                  two categories beside it for the sake of two characters. Read
                  aloud it was always one phrase anyway.

                  **No `dir="ltr"`.** It was there to stack the two, and with
                  them side by side it would do active harm: it pins the number
                  to the inline-start, so an Arabic reader coming from the right
                  meets `سم` before the figure it qualifies. The digits are
                  European and stay internally LTR on their own under the bidi
                  algorithm — `188` never becomes `881` — while the *order* of
                  number and unit is the paragraph's to decide, which puts the
                  figure first in both scripts. Same reasoning, and the same
                  mistake once made, as the time range in `appointment-card.tsx`.

                  `items-baseline` rather than `items-center`: the two sit a full
                  step apart on the scale, and centring them by box left the unit
                  floating above the numeral's foot.
                */
                <span className="flex items-baseline justify-center gap-x-1">
                  <span className="font-heading text-xl leading-tight font-semibold tabular-nums sm:text-2xl">
                    {stat.value}
                  </span>
                  {stat.unit ? (
                    <span className="text-xs text-muted-foreground sm:text-sm">{stat.unit}</span>
                  ) : null}
                </span>
              )}
            </dd>
          </Card>
        );
      })}
    </dl>
  );
}
