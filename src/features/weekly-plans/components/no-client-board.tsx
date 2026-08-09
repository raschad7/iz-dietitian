'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { getLocaleDirection } from '@/i18n/routing';

import type { CatalogEntry, PlannableClient } from '../queries';

import { BoardSheet, useCompactPlanner } from './board-sheet';
import { ClientPicker } from './client-picker';
import { DishCatalog } from './dish-catalog';

/**
 * The planner with no client chosen.
 *
 * This used to be a page of its own — a lone combobox floating in the middle of
 * an otherwise blank screen, with a line of text under it. It answered the
 * question "who?" without ever showing what it was asking on behalf of, so the
 * first thing the planner showed a dietitian was a form rather than the tool.
 *
 * So it is the tool, empty. Same header, same picker in the same place it will
 * stay once a client is chosen, same rail. Choosing a client fills the middle
 * in rather than replacing the screen, and nothing moves under the pointer.
 *
 * The rail carries the catalog and only the catalog. The other three panels —
 * the client, the open meal, the past weeks — are all *about* a client, so with
 * none chosen they would be three tabs saying "pick a client" beside one that
 * works. The catalog needs nobody, and browsing it is a real thing to do here.
 * It is a heading rather than a one-item `tablist`, because a tab strip with a
 * single tab tells a screen reader there is a choice to make when there is not.
 */
export function NoClientBoard({
  clients,
  catalog,
}: {
  clients: readonly PlannableClient[];
  catalog: readonly CatalogEntry[];
}) {
  const t = useTranslations('weeklyPlans');
  const activeLocale = useLocale();
  const [sheetOpen, setSheetOpen] = useState(false);
  const compactPlanner = useCompactPlanner();

  const railContent = (
    <>
      <h2 className="shrink-0 border-b border-border pb-3 text-label font-semibold">
        {t('tabs.dishes')}
      </h2>

      <div className="min-h-0 flex-1 overflow-hidden pt-3">
        {/* No client, so no allergens to block anything and no history to rank
            by — the catalog is browsable but not draggable, because there is no
            board to drag onto. */}
        <DishCatalog catalog={catalog} usage={{}} slot={null} editable={false} />
      </div>
    </>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <header className="border-b border-border pb-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <span className="block text-caption text-muted-foreground">{t('title')}</span>
            <ClientPicker clients={clients} appearance="heading" />
          </div>

          {/* The plan actions are deliberately absent rather than disabled.
              There is no plan to publish and no week to start until there is
              someone to start it for, and a row of dead buttons is a worse
              answer to "what can I do here" than an empty one. */}
          <span className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="planner-compact-trigger"
              onClick={() => setSheetOpen(true)}
            >
              {t('openPanels')}
            </Button>
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        <section className="flex min-w-0 flex-1 items-center justify-center border-y border-dashed border-border px-6 py-16 text-center">
          <div className="max-w-md">
            <h3 className="font-heading text-heading-sm font-semibold">{t('noClientTitle')}</h3>
            <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">
              {t('noClientHint')}
            </p>
          </div>
        </section>

        <aside className="planner-desktop-rail w-[22rem] shrink-0 flex-col border-s border-border ps-5">
          {!compactPlanner && railContent}
        </aside>
      </div>

      <BoardSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        label={t('openPanels')}
        closeLabel={t('close')}
        dir={getLocaleDirection(activeLocale)}
      >
        {compactPlanner && railContent}
      </BoardSheet>
    </div>
  );
}
