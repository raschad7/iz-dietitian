'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * The Progress tab's week picker.
 *
 * Same shape as `ClientSearch`'s field: the selection round-trips through the
 * URL (`?week=YYYY-MM-DD`) rather than through client state, so the week a
 * dietitian is reading is shareable and survives a reload. Picking a week
 * triggers a real navigation — the page's server component re-reads
 * `getClientWeekProgress` for the new week — wrapped in `startTransition` so
 * the previous week's numbers stay on screen, dimmed, until the new ones
 * arrive instead of flashing to a loading state.
 *
 * **`?tab=` is left exactly as it is.** This control only exists inside the
 * Progress panel, which `ClientProfileTabs` has already mounted client-side
 * by the time anyone can reach it — so there is nothing to "switch to."
 * Writing `tab=progress` here used to change `ClientProfileTabs`'s
 * `defaultTab` prop on an already-mounted, uncontrolled `PanelTabs`, and Base
 * UI reads `defaultValue` once at mount: a prop that changes after that is
 * the exact "uncontrolled component receiving a new default" case it warns
 * about. Carrying `searchParams` forward untouched keeps whatever `tab` was
 * already there — or wasn't — instead of asserting a value the mounted tree
 * cannot legally accept.
 */
export function ClientProgressWeekSelect({
  weeks,
  selected,
}: {
  weeks: readonly SelectFieldOption<string>[];
  selected: string;
}) {
  const t = useTranslations('clients.progress');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(week: string) {
    const next = new URLSearchParams(searchParams);
    next.set('week', week);

    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="w-full max-w-56" aria-busy={isPending}>
      <SelectField
        value={selected}
        onValueChange={handleChange}
        options={weeks}
        aria-label={t('weekLabel')}
        size="sm"
        className={isPending ? 'opacity-70 transition-opacity' : 'transition-opacity'}
      />
    </div>
  );
}
