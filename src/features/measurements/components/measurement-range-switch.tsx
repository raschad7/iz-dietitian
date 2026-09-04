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
    /*
      `shape="pill"` — the control the record's own tab bar wears, one screen
      up. Both answer the same question ("which view of this am I in?") and they
      were answering it in two visual languages: the tabs slid a raised white
      thumb through a grey well, and this filled the selected half with solid
      brand green. A segmented control that is *not* the page's primary action
      should not be the loudest thing on the card, and two switches on one
      record should not look like two different kinds of control.
      `Segmented` supplies the travelling thumb and its easing; nothing here
      re-animates it.

      `pill` is `w-full` by construction — its two halves are equal because the
      thumb behind them is sized `100% / count`, so the width belongs to this
      wrapper rather than to the control. Full-bleed on a phone, where it sits
      under the title on its own row and is aimed at with a thumb; capped from
      `sm` up, where it sits at the end of the card header.
    */
    <div aria-busy={isPending} className="w-full sm:w-72">
      <Segmented
        role="radiogroup"
        shape="pill"
        label={ariaLabel}
        value={range}
        onChange={handleChange}
        /*
          The group is named "Compare against", so the options do not repeat
          "Since" — they complete that sentence. Shorter labels are what keep
          each half on one line: a pill's segments are equal by construction,
          so a label that will not fit wraps to two lines and takes the whole
          control with it.
        */
        options={[
          { value: 'last', label: <span className="truncate">{lastLabel}</span> },
          { value: 'start', label: <span className="truncate">{startLabel}</span> },
        ]}
        className={isPending ? 'opacity-70 transition-opacity' : 'transition-opacity'}
      />
    </div>
  );
}
