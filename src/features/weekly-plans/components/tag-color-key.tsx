'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { summariseTagColors } from '../board-tag-summary';
import { dishSourceDotClasses } from '../meal-tag-tone';
import type { BoardDay } from '../queries';

/**
 * What the coloured rule on top of each meal card means.
 *
 * ## Why it reads the board instead of listing the palette
 *
 * A static legend of every mark is a chart of the design system, and it is wrong
 * about the thing in front of the reader: a week that uses two colours does not
 * need a key with four it does not contain. So this counts the board — the same
 * `source` the card itself paints with — and lists only the marks actually on
 * screen, each with how many meals wear it.
 *
 * That turns a legend into a reading, and since the axis became `source` it is a
 * reading a dietitian actually wants: "twenty-nine cooked at home, four from the
 * street, two from a restaurant" is a fact about whether this week is one the
 * client can live. It costs nothing extra to say — the counting is already done
 * to know which rows to draw.
 *
 * The neutral row is included whenever untagged meals exist, because those cards
 * draw a grey rule and an unexplained mark is exactly what a key is for.
 *
 * ## Why it lives in a popover
 *
 * The board is thirty-five cards on a fixed-height workspace and every pixel of
 * chrome is taken from the week. A key is reference material — read once, when
 * the colours are new, and never again — so it earns no permanent space. Inside
 * the header's existing overflow popover it costs zero layout whether it is
 * opened or not.
 */
export function TagColorKey({ days }: { days: readonly BoardDay[] }) {
  const t = useTranslations('weeklyPlans');

  const { rows, untagged } = useMemo(() => summariseTagColors(days), [days]);

  // An empty week explains nothing, and a key with one grey row explains less
  // than the silence would.
  if (rows.length === 0) return null;

  return (
    <section>
      <p className="pb-1.5 text-caption font-semibold text-muted-foreground">{t('colorKey')}</p>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {rows.map(({ tag, count }) => (
          <KeyRow
            key={tag}
            dot={dishSourceDotClasses(tag)}
            label={t(`axes.source.${tag}`)}
            count={count}
          />
        ))}

        {untagged > 0 && (
          <KeyRow
            dot="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/15 bg-border"
            label={t('colorKeyUntagged')}
            count={untagged}
            muted
          />
        )}
      </ul>
    </section>
  );
}

/** One mark, what it means, and how many meals this week carry it. */
function KeyRow({
  dot,
  label,
  count,
  muted,
}: {
  dot: string;
  label: string;
  count: number;
  muted?: boolean;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-caption">
      <span aria-hidden className={dot} />
      <span className={cn('min-w-0 truncate', muted && 'text-muted-foreground')}>{label}</span>
      {/* `dir="ltr"` because it is a figure inside Arabic text, and tabular so a
          two-column key does not shuffle between weeks. */}
      <span className="ms-auto shrink-0 text-muted-foreground tabular-nums" dir="ltr">
        {count}
      </span>
    </li>
  );
}
