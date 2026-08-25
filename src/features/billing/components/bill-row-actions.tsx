'use client';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import type { BillTranslator } from '@/features/billing/bill';
import { PrintBillButton } from '@/features/billing/components/print-bill-button';
import { ROW_ACTION_CLASS } from '@/features/billing/components/row-action';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The two printing controls at the end of a Bills row.
 *
 * The printer prints the whole account — every operation on one page — by
 * raising the browser's own print dialog over this screen, without opening a
 * tab or navigating; see `PrintBillButton`. The chevron opens the subscriber's
 * own bills underneath the row, where each one has a printer of its own.
 *
 * Neither creates anything. A bill is a ledger row rendered as a PDF, so both
 * are links to a document built from rows that already exist — printing a
 * receipt twice has to produce the same receipt twice.
 *
 * ## The chevron
 *
 * It points along the reading direction while the panel is shut and turns to
 * point down at the panel while it is open, on the app's own easing curve. The
 * `rtl:` pair is not a duplicate: lucide mirrors the glyph in Arabic, so it has
 * to turn the other way to arrive at the same place. `motion-reduce` keeps the
 * angle and drops the travel — the angle is the state, the movement is not.
 *
 * The open state lives in `BillsTable`, which renders both this and the panel:
 * they are two `<tr>`s, and a row cannot hold the state its sibling reads.
 */
export function BillRowActions({
  locale,
  clientId,
  clientName,
  open,
  onToggle,
  panelId,
  t,
}: {
  locale: Locale;
  clientId: string;
  clientName: string;
  open: boolean;
  onToggle: () => void;
  /** The panel this button controls, for `aria-controls`. */
  panelId: string;
  t: BillTranslator;
}) {
  return (
    <>
      <PrintBillButton
        href={`/${locale}/app/clients/bills/${clientId}/print`}
        label={t('print.statementFor', { name: clientName })}
        title={t('print.statement')}
      />

      {/*
        `aria-expanded` and `aria-controls` are what make this a disclosure
        rather than a decorative arrow: without them a screen reader announces a
        button with no state and no relationship to the rows that appear.

        `type="button"` because the page contains the search `<form>`, and an
        unqualified button inside one submits it.
      */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={ROW_ACTION_CLASS}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('print.billsFor', { name: clientName })}
        title={t('print.bills')}
      >
        <Icon
          name="chevronEnd"
          className={cn(
            'size-5 transition-transform duration-(--duration-arc) ease-(--ease-sweep) motion-reduce:transition-none',
            open && 'rotate-90 rtl:-rotate-90',
          )}
        />
      </Button>
    </>
  );
}
