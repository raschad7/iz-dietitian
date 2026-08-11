'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import type { Locale } from '@/i18n/routing';

import type { CatalogEntry } from '../queries';
import type { RecentUse } from '../usage';

import { DishCatalogDrawer } from './dish-catalog-drawer';
import { NewWeekDialog, type NewWeekProps } from './new-week-dialog';

type EmptyPlanBoardProps = {
  clientId: string;
  catalog: readonly CatalogEntry[];
  usage: Record<string, RecentUse>;
  locale: Locale;
  history: React.ReactNode;
  profile: React.ReactNode;
  newWeek: NewWeekProps;
};

/** The planner before its first week exists, using the same rail-free shell. */
export function EmptyPlanBoard({
  clientId,
  catalog,
  usage,
  locale,
  history,
  profile,
  newWeek,
}: EmptyPlanBoardProps) {
  const t = useTranslations('weeklyPlans');
  const [catalogOpen, setCatalogOpen] = useState(false);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <header className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        {profile}
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/50 px-4 py-3">
            <Button type="button" size="sm" variant="outline" onClick={() => setCatalogOpen(true)}>
              <Icon name="dishes" />
              {t('tabs.dishes')}
            </Button>

            <NewWeekDialog
              clientId={clientId}
              board={null}
              locale={locale}
              newWeek={newWeek}
              triggerLabel={t('createWeek')}
              triggerVariant="default"
            />

            <Popover>
              <PopoverTrigger
                aria-label={t('moreActions')}
                title={t('moreActions')}
                className={buttonVariants({ variant: 'neutral', size: 'icon-sm' })}
              >
                <Icon name="moreActions" />
                <span className="sr-only">{t('moreActions')}</span>
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="max-h-[min(32rem,70vh)] w-80 overflow-y-auto p-3">
                <PopoverTitle className="pb-1 text-label font-semibold">{t('history')}</PopoverTitle>
                {history}
              </PopoverContent>
            </Popover>
        </div>
      </header>

      <section className="flex min-h-64 min-w-0 flex-1 items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md">
          <h2 className="font-heading text-heading-sm font-semibold">{t('noPlanYet')}</h2>
          <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">{t('noPlanHint')}</p>
        </div>
      </section>

      <DishCatalogDrawer
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        catalog={catalog}
        usage={usage}
        slot={null}
        editable={false}
        locale={locale}
      />
    </div>
  );
}
