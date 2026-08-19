'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useRouter } from '@/i18n/navigation';

import type { RefinedFood } from '../ingredient-refine';

import { DishEditorDialog } from './dish-editor-dialog';

/**
 * The catalog's primary action: "add dish", opening the builder as a side sheet
 * over the catalog rather than navigating away from it (spec §12).
 */
export function AddDishButton({
  locale,
  search,
}: {
  locale: string;
  /** Injectable ingredient search for the dev harness; defaults to the real action. */
  search?: (locale: string, query: string) => Promise<RefinedFood[]>;
}) {
  const t = useTranslations('dishes');
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleSaved() {
    setOpen(false);
    // The catalog is server-rendered; the new dish appears once it re-fetches.
    router.refresh();
  }

  return (
    <>
      {/* Lives in the catalog toolbar beside Filters, so it sits `shrink-0` in
          that row's fixed height. The word drops below `sm` for the same reason
          the Filters label does: at 375px the row cannot hold both words, and a
          `+` on the page's primary action is unambiguous. */}
      <Button
        type="button"
        /* The guided tour's "how to add a new dish" step points here. */
        data-guide="dishes-add"
        className="shrink-0"
        aria-label={t('addDish')}
        onClick={() => setOpen(true)}
      >
        <Icon name="add" />
        <span className="hidden sm:inline">{t('addDish')}</span>
      </Button>

      <DishEditorDialog
        locale={locale}
        open={open}
        onOpenChange={setOpen}
        onSaved={handleSaved}
        search={search}
      />
    </>
  );
}
