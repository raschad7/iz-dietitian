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
      {/*
        The same header the board has, because it is the same header.

        This used to be its own shape — the client strip with a second full-width
        toolbar bar stacked under it, on a card with a shadow — so choosing a
        client who happens to have no week yet redrew the top of the screen into
        a different object, and creating the first week redrew it back. The state
        that changed is whether a plan exists; the frame around the client is not
        part of that. Same grid, same action bar, same absence of a shadow: see
        `plan-board.tsx`, which this deliberately mirrors.

        What is legitimately different is which control is filled. There, publish
        is the decision and "new week" is a thing you may also do; here there is
        nothing to publish and the first week is the only reason to be on this
        screen, so that button keeps the solid fill.
      */}
      <header className="grid overflow-hidden rounded-lg border border-border bg-card 2xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">{profile}</div>

        <div className="planner-action-bar mx-2 mb-2 flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-lg bg-muted/70 p-1.5 2xl:my-2 2xl:me-2 2xl:ms-0 2xl:w-auto 2xl:self-center 2xl:flex-nowrap 2xl:justify-center">
            <Button
              type="button"
              size="sm"
              variant="neutral"
              className="px-3 2xl:size-10 2xl:rounded-full 2xl:px-0"
              aria-label={t('tabs.dishes')}
              title={t('tabs.dishes')}
              onClick={() => setCatalogOpen(true)}
            >
              <Icon name="dishes" />
              <span className="2xl:sr-only">{t('tabs.dishes')}</span>
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
