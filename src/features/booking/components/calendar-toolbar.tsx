'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { CALENDAR_VIEWS, type CalendarView } from '../schema';

/**
 * View switch, date navigation and search.
 *
 * The previous/next chevrons point along the *reading* direction: in Arabic
 * "previous" points right. `ChevronLeft`/`ChevronRight` are physical icons, so
 * which component renders in which slot is chosen from the locale here — the
 * one place in the feature where an icon has to know about direction.
 */

export type CalendarToolbarProps = {
  locale: Locale;
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
  locale,
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

  const isRtl = getLocaleDirection(locale) === 'rtl';
  const PreviousIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" onClick={onToday}>
          {t('nav.today')}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('nav.previous')} onClick={onPrevious}>
          <PreviousIcon />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('nav.next')} onClick={onNext}>
          <NextIcon />
        </Button>
      </div>

      <h2 className="min-w-40 text-sm font-semibold" dir="auto">
        {rangeLabel}
      </h2>

      <div className="ms-auto flex items-center gap-2">
        <div className="relative w-48">
          <Search
            aria-hidden
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
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

        <div role="tablist" aria-label={t('nav.view')} className="flex rounded-lg border border-border p-0.5">
          {CALENDAR_VIEWS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={view === candidate}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                view === candidate ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
              onClick={() => onViewChange(candidate)}
            >
              {t(`nav.${candidate}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
