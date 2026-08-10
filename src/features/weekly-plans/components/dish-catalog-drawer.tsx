'use client';

import { Dialog as DrawerPrimitive } from '@base-ui/react/dialog';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
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
    <DrawerPrimitive.Root
      open={open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Popup
          dir={direction}
          className={cn(
            PLANNER_THEME,
            'fixed inset-y-0 z-50 flex w-[min(24rem,calc(100vw-1rem))] flex-col bg-popover text-popover-foreground shadow-overlay outline-none',
            direction === 'rtl' ? 'end-0 border-s border-border' : 'start-0 border-e border-border',
            'transition-[opacity,transform] duration-(--duration-sweep) ease-(--ease-sweep)',
            'data-ending-style:-translate-x-full data-ending-style:opacity-0',
            'data-starting-style:-translate-x-full data-starting-style:opacity-0',
          )}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <DrawerPrimitive.Title className="font-heading text-heading-sm font-semibold">
                {t('dishCatalog')}
              </DrawerPrimitive.Title>
              <DrawerPrimitive.Description className="text-caption text-muted-foreground">
                {t('dishCatalogHint')}
              </DrawerPrimitive.Description>
            </div>
            <DrawerPrimitive.Close
              render={<Button type="button" variant="ghost" size="icon-sm" />}
              aria-label={t('close')}
            >
              <Icon name="close" />
            </DrawerPrimitive.Close>
          </header>

          <div className="min-h-0 flex-1 p-4">
            <DishCatalog catalog={catalog} usage={usage} slot={slot} editable={editable} />
          </div>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
