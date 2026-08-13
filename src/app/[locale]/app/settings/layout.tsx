import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { SettingsToolbar } from '@/features/settings/components/settings-toolbar';

/**
 * The settings surface: one heading, one tab bar, and the page.
 *
 * **There used to be two headings on every screen.** This file rendered an `h1`
 * and a description, and then each of the four pages rendered a
 * `SettingsPageHeader` — an `h2` and a second description — immediately below
 * it, repeating what the active tab already said. The component is gone and the
 * pages start at their sections.
 *
 * The width cage is gone too. `me-auto max-w-4xl` pinned every page to the
 * inline-start edge and abandoned the rest of the viewport; rows now span the
 * column, which is what puts each value and its control at opposite ends of a
 * line rather than stacked with empty space beside them.
 *
 * There is no dirty-state provider here any more, and no save bar: values are
 * edited in dialogs that commit their own field. See `settings-edit-dialog.tsx`.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('settingsWorkspace');

  return (
    /*
      A ceiling rather than none: a settings row is a label, a value and a
      button, and past about 1200px the gap between the value and its control
      stops reading as one row. Every laptop this is used on is below that and
      gets the full width.
    */
    <div className="flex w-full max-w-[1200px] flex-col gap-5 text-start">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-2xl text-body-sm text-muted-foreground">{t('description')}</p>
      </header>

      <SettingsToolbar />

      {children}
    </div>
  );
}
