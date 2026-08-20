import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { SettingsToolbar } from '@/features/settings/components/settings-toolbar';
import { APP_VERSION } from '@/lib/version';

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
      Full width, like every other screen in the app.

      This was capped at `max-w-[1200px]` with no auto margin, so on anything
      wider the column stayed 1200px and *pinned itself to the inline-start
      edge* — collapsing the rail did not widen the page, it just moved the
      viewport's free space into one enormous void at the inline-end. Settings
      was the only screen that did this, which is exactly how it was noticed.

      A ceiling was defensible for a row of label, value and button; a lopsided
      one is not, and `main` already gives every other page the whole column.
    */
    <div className="flex w-full flex-col gap-5 text-start">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-2xl text-body-sm text-muted-foreground">{t('description')}</p>
      </header>

      <SettingsToolbar />

      {children}

      <footer className="mt-6 border-t border-border/60 pt-4 text-start">
        <p className="text-caption text-muted-foreground">
          <span>{t('version')}:</span> <span dir="ltr">v{APP_VERSION}</span>
        </p>
      </footer>
    </div>
  );
}
