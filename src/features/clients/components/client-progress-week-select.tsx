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
 * **`?tab=` is left exactly as it is, and it is already right.**
 * `ClientProfileTabs` writes the live view into the URL with a shallow
 * `history.replaceState` the moment it is switched, and `useSearchParams` reads
 * that — so copying the params forward here carries `tab=progress` on its own.
 * There is nothing for this control to assert.
 *
 * It matters that it does not assert one anyway. This navigation re-runs the
 * page, so `defaultTab` arrives at the tab bar again; that bar seeds its state
 * from the prop once and is controlled from itself afterwards, precisely so a
 * re-render cannot move the reader off the view they are reading.
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
