'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import type { CatalogEntry } from '../queries';
import { PLANNER_THEME } from '../theme';
import type { RecentUse } from '../usage';

import { DishCatalog } from './dish-catalog';

/**
 * A non-modal catalog: the board remains a live drop surface while a dish is
 * lifted. It is pinned to the physical left by choosing the matching logical
 * edge for the current document direction, so the component keeps the app's
 * RTL contract without a physical inset utility.
 */
export function DishCatalogDrawer({
  open,
  onOpenChange,
  catalog,
  usage,
  slot,
  editable,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: readonly CatalogEntry[];
  usage: Record<string, RecentUse>;
  slot: { slotKey: string; budgetKcal: number } | null;
  editable: boolean;
  locale: Locale;
}) {
  const t = useTranslations('weeklyPlans');
  const direction = getLocaleDirection(locale);

  return (
    <Sheet
      open={open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
    >
      <SheetContent
        dir={direction}
        side={direction === 'rtl' ? 'inline-end' : 'inline-start'}
        showOverlay={false}
        showCloseButton={false}
        /*
          The width, prefixed with the same variant the sheet states its own in.

          A bare `w-[min(28rem,…)] sm:max-w-none` looked like it was overriding
          the sheet and was not: the base sizes itself as
          `data-[side=inline-end]:w-3/4` and `data-[side=inline-end]:sm:max-w-sm`,
          and tailwind-merge only collapses two classes when their variants
          match as well as their property. Different variant, no collapse — so
          both survived into the class list and the sheet's own rule, later in
          the stylesheet, won. The catalog asked for 28rem and got three
          quarters of a phone or 24rem of a desktop, which is a column of
          truncated dish names.

          Both sides are spelled out because the side is chosen at runtime from
          the document direction, and a class Tailwind never sees in the source
          is a class that is never generated.
        */
        className={cn(
          PLANNER_THEME,
          'data-[side=inline-start]:w-[min(28rem,calc(100vw-0.75rem))] data-[side=inline-end]:w-[min(28rem,calc(100vw-0.75rem))]',
          'data-[side=inline-start]:sm:max-w-none data-[side=inline-end]:sm:max-w-none',
        )}
      >
        {/*
          One line, and the hint is not on it.

          This header was 84px of a panel whose whole job is a list: a 40px
          badge, a 24px title and a two-line sentence about dragging, above a
          search field and a filter row — four bands of chrome before the first
          dish. The badge said "dishes" to a panel already titled "dish
          catalog", and the sentence taught a gesture that teaches itself the
          first time a card is picked up, then went on repeating itself forever.

          What is left is a title and a close button on one 52px row. The hint
          stays in the accessible description, where the dialog announces it
          once on open and never takes a pixel for it.
        */}
        <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border bg-muted/45 px-4">
            <Icon name="dishes" className="size-5 shrink-0 text-primary" />
            <SheetTitle className="min-w-0 flex-1 truncate font-heading text-heading-sm font-medium">
              {t('dishCatalog')}
            </SheetTitle>
            <SheetDescription className="sr-only">{t('dishCatalogHint')}</SheetDescription>
            <SheetClose
              render={<Button type="button" variant="neutralGhost" size="icon-sm" />}
              aria-label={t('close')}
            >
              <Icon name="close" />
            </SheetClose>
        </header>

        <div className="min-h-0 flex-1 px-4 pb-4 pt-3">
          <DishCatalog catalog={catalog} usage={usage} slot={slot} editable={editable} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
