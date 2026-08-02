'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';

import { CALENDAR_VIEWS, type CalendarView } from '../schema';

/**
 * View switch, date navigation and search.
 *
 * The previous/next chevrons point along the *reading* direction: in Arabic
 * "previous" points right. `chevronStart`/`chevronEnd` are logical names and
 * `Icon` mirrors them in RTL, so this no longer has to branch on the locale —
 * the direction is expressed once, in the icon's name.
 */

export type CalendarToolbarProps = {
  view: CalendarView;
  /** Already formatted for the current view — "August 2026", "5 August 2026". */
  rangeLabel: string;
  query: string;
  onQueryChange: (query: string) => void;
  onViewChange: (view: CalendarView) => void;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function CalendarToolbar({
  view,
  rangeLabel,
  query,
  onQueryChange,
  onViewChange,
  onToday,
  onPrevious,
  onNext,
}: CalendarToolbarProps) {
  const t = useTranslations('booking');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" onClick={onToday}>
          {t('nav.today')}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('nav.previous')} onClick={onPrevious}>
          <Icon name="chevronStart" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('nav.next')} onClick={onNext}>
          <Icon name="chevronEnd" />
        </Button>
      </div>

      <h2 className="min-w-40 text-sm font-semibold" dir="auto">
        {rangeLabel}
      </h2>

      <div className="ms-auto flex items-center gap-2">
        <div className="relative w-48">
          <Icon
            name="search"
            className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            className="h-8 ps-8"
          />
        </div>

        <Segmented
          label={t('nav.view')}
          size="sm"
          value={view}
          onChange={onViewChange}
          options={CALENDAR_VIEWS.map((candidate) => ({
            value: candidate,
            label: t(`nav.${candidate}`),
          }))}
        />
      </div>
    </div>
  );
}
