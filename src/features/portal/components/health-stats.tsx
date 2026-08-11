import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * One measured fact from the health record, as a tile.
 *
 * `kind` is what the value *is*, not how it should look — a category takes the
 * pill and a measurement takes a figure. The distinction earns itself: a
 * category is one of a known few and reads as a label, where a height is a
 * quantity you compare against another one, and tabular digits are what make
 * that possible. Deciding it per value would leave the grid pilled wherever the
 * caller happened to feel like it.
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
  const columns = stats.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3';

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
      {stats.map((stat) => {
        const empty = stat.value === null || stat.value.trim() === '';

        return (
          <Card
            key={stat.label}
            variant={empty ? 'empty' : 'tile'}
            className="items-center gap-1.5 p-3 text-center sm:gap-2 sm:p-4"
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
                  Default `Badge` — brand-subtle olive, which carries no status
                  meaning. A status variant here would be claiming an activity
                  level is on track or needs follow-up, and neither is something
                  this screen knows (§Status is not a traffic light).

                  `whitespace-normal` is the one override the narrow tile needs:
                  the pill defaults to never wrapping, which at a third of a
                  phone's width pushes "Moderately active" straight out of the
                  tile. A pill that takes two lines is still plainly a pill.
                */
                <Badge className="whitespace-normal px-2 sm:px-2.5">{stat.value}</Badge>
              ) : (
                /*
                  The figure leads and the unit sits under it, per the reference:
                  at a glance the tile answers with a number, and "cm" is what
                  that number is in rather than part of it. `dir="ltr"` keeps the
                  digits in Latin order inside Arabic (§RTL).
                */
                <span className="block" dir="ltr">
                  <span className="block font-heading text-xl leading-tight font-semibold tabular-nums sm:text-2xl">
                    {stat.value}
                  </span>
                  {stat.unit ? (
                    <span className="block text-xs text-muted-foreground sm:text-sm">
                      {stat.unit}
                    </span>
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
