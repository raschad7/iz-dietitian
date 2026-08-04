'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { getLocaleDirection } from '@/i18n/routing';

import type { CatalogEntry, PlannableClient } from '../queries';
import { railTabsForPlan, type RailTab } from '../rail-state';
import type { RecentUse } from '../usage';

import { BoardSheet, useBelowXl } from './board-sheet';
import { ClientPicker } from './client-picker';
import { DishCatalog } from './dish-catalog';
import { NewWeekDialog, type NewWeekProps } from './new-week-dialog';
import { RailTabs } from './rail-tabs';

type EmptyPlanBoardProps = {
  clientId: string;
  clients: readonly PlannableClient[];
  catalog: readonly CatalogEntry[];
  usage: Record<string, RecentUse>;
  locale: string;
  history: React.ReactNode;
  profile: React.ReactNode;
  newWeek: NewWeekProps;
};

/** The planner before its first week exists. */
export function EmptyPlanBoard({
  clientId,
  clients,
  catalog,
  usage,
  locale,
  history,
  profile,
  newWeek,
}: EmptyPlanBoardProps) {
  const t = useTranslations('weeklyPlans');
  const activeLocale = useLocale();
  const [tab, setTab] = useState<RailTab>('client');
  const [sheetOpen, setSheetOpen] = useState(false);
  const belowXl = useBelowXl();

  const tabs = railTabsForPlan(false).map((id) => ({ id, label: t(`tabs.${id}`) }));
  const railContent = (
    <>
      <RailTabs
        className="shrink-0"
        label={t('title')}
        active={tab}
        onSelect={setTab}
        tabs={tabs}
      />

      <div
        role="tabpanel"
        id={`rail-panel-${tab}`}
        aria-labelledby={`rail-tab-${tab}`}
        className="min-h-0 flex-1 overflow-hidden pt-3"
      >
        {tab === 'dishes' ? (
          <DishCatalog catalog={catalog} usage={usage} slot={null} editable={false} />
        ) : tab === 'meal' ? (
          <p className="px-1 text-body-sm leading-relaxed text-muted-foreground">
            {t('noPlanMeal')}
          </p>
        ) : tab === 'past' ? (
          <div className="no-scrollbar h-full overflow-y-auto overflow-x-hidden">{history}</div>
        ) : (
          <div className="no-scrollbar h-full overflow-y-auto overflow-x-hidden">{profile}</div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="border-b border-border pb-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <span className="block text-caption text-muted-foreground">{t('title')}</span>
            <ClientPicker
              clients={clients}
              selectedClientId={clientId}
              appearance="heading"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="planner-compact-trigger"
              onClick={() => setSheetOpen(true)}
            >
              {t('openPanels')}
            </Button>

            <NewWeekDialog
              clientId={clientId}
              board={null}
              locale={locale}
              newWeek={newWeek}
              triggerLabel={t('createWeek')}
              triggerVariant="default"
            />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        <section className="flex min-w-0 flex-1 items-center justify-center border-y border-dashed border-border px-6 py-16 text-center">
          <div className="max-w-md">
            <h2 className="font-heading text-heading-sm font-semibold">{t('noPlanYet')}</h2>
            <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">
              {t('noPlanHint')}
            </p>
          </div>
        </section>

        <aside className="planner-desktop-rail w-[22rem] shrink-0 flex-col border-s border-border ps-5">
          {!belowXl && railContent}
        </aside>
      </div>

      <BoardSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        label={t('openPanels')}
        closeLabel={t('close')}
        dir={getLocaleDirection(activeLocale)}
      >
        {belowXl && railContent}
      </BoardSheet>
    </div>
  );
}
