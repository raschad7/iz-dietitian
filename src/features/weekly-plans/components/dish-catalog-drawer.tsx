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
        className={cn(
          PLANNER_THEME,
          'w-[min(28rem,calc(100vw-0.75rem))] sm:max-w-none',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border bg-muted/45 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-primary shadow-card">
              <Icon name="dishes" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="font-heading text-heading-lg font-medium">
                {t('dishCatalog')}
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-caption leading-relaxed">
                {t('dishCatalogHint')}
              </SheetDescription>
            </div>
            <SheetClose
              render={<Button type="button" variant="ghost" size="icon-sm" />}
              aria-label={t('close')}
            >
              <Icon name="close" />
            </SheetClose>
        </header>

        <div className="min-h-0 flex-1 px-5 pb-4 pt-3">
          <DishCatalog catalog={catalog} usage={usage} slot={slot} editable={editable} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
