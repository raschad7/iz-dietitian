'use client';

import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Segmented } from '@/components/ui/segmented';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * "Since last visit" / "Since the start".
 *
 * The choice round-trips through `?range=` rather than through client state,
 * the same arrangement `ClientProgressWeekSelect` documents for its week: the
 * comparison a dietitian is reading is then shareable, survives a reload, and
 * is re-derived on the server by `summariseProgress` rather than duplicated
 * here. `startTransition` keeps the previous numbers on screen, dimmed, while
 * the new ones are fetched, instead of flashing an empty card.
 *
 * `?tab=` is left alone deliberately — `ClientProfileTabs` writes the live view
 * into the URL itself, so copying the params forward carries it. See that
 * component's note for why this must not assert one.
 */
export function MeasurementRangeSwitch({
  range,
  lastLabel,
  startLabel,
  ariaLabel,
}: {
  range: 'last' | 'start';
  lastLabel: string;
  startLabel: string;
  ariaLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: 'last' | 'start') {
    const params = new URLSearchParams(searchParams);
    params.set('range', next);

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div aria-busy={isPending}>
      <Segmented
        role="radiogroup"
        size="sm"
        label={ariaLabel}
        value={range}
        onChange={handleChange}
        options={[
          { value: 'last', label: lastLabel },
          { value: 'start', label: startLabel },
        ]}
        className={isPending ? 'opacity-70 transition-opacity' : 'transition-opacity'}
      />
    </div>
  );
}
