'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useRouter } from '@/i18n/navigation';

import { DishEditorDialog } from './dish-editor-dialog';

/**
 * The catalog's primary action: "add dish", opening the builder as a side sheet
 * over the catalog rather than navigating away from it (spec §12).
 */
export function AddDishButton({ locale }: { locale: string }) {
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
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Icon name="add" />
        {t('addDish')}
      </Button>

      <DishEditorDialog locale={locale} open={open} onOpenChange={setOpen} onSaved={handleSaved} />
    </>
  );
}
