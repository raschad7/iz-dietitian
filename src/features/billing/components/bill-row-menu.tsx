'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { sendPaymentReminderAction } from '@/features/billing/actions';
import { PrintBillButton } from '@/features/billing/components/print-bill-button';
import { MENU_ITEM_CLASS, ROW_ACTION_CLASS } from '@/features/billing/components/row-action';
import { initialBillingFormState } from '@/features/billing/form-state';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The Bills row's overflow menu — the things that are done *about* an account
 * rather than *to* it.
 *
 * Recording a charge and recording a payment stay on the row, because they are
 * what the screen is open for and a register is worked down one row at a time.
 * What lives in here is the pair that follow from a balance rather than change
 * one: chase it, or print it.
 *
 * ## Why a menu at all
 *
 * The end of a row is a cell a few icons wide, and every mark added to it costs
 * the ones already there — four glyphs read as a set, six read as a toolbar
 * nobody scans. A menu spends one mark and gives its contents room for words,
 * which is what the two inside it need: "Send reminder" and "Print all bills"
 * are not glyphs anybody recognises unlabelled.
 *
 * ## The reminder greys out when there is nothing to chase
 *
 * A subscriber who owes nothing must not be reminded, so the item is disabled
 * on `remainingMinor`. That is the *card's* half of the rule — the real one is
 * in `sendPaymentReminderAction`, which re-reads the balance on the server and
 * refuses on its own. A form posts what it likes, and two people opening this
 * menu a minute apart would both have seen a row that said it was allowed.
 */
export function BillRowMenu({
  locale,
  clientId,
  /** What is still to collect. Zero or less greys the reminder out. */
  remainingMinor,
  labels,
}: {
  locale: Locale;
  clientId: string;
  remainingMinor: number;
  labels: {
    /** The trigger's hover words and its accessible name. */
    more: string;
    reminder: string;
    reminderNothing: string;
    confirmTitle: string;
    confirmBody: string;
    sent: string;
    printAll: string;
    printAllFor: string;
  };
}) {
  const t = useTranslations('billing');
  const [state, formAction] = useActionState(sendPaymentReminderAction, initialBillingFormState);

  /*
    Both outcomes are said out loud, and the failure is the half that matters.

    A send that quietly did nothing is the worst state this control can be in:
    the dietitian saw a press, saw no error, and moves on believing a subscriber
    was told something they were never told. The reasons are named rather than
    collapsed — WhatsApp not connected, no number on the record, a number nobody
    uses for WhatsApp — because each one is a different thing to do next. See
    `sendFailureKey`.

    ⚠ **It announces a state once, and the ref is what makes that true.** The
    effect's dependencies include `t`, which `useTranslations` hands back as a
    fresh function on every render — so the effect re-ran whenever anything
    re-rendered this row, and re-toasted an outcome nobody had just caused.
    Recording a payment revalidates the Bills page, which re-renders every row,
    which brought back "WhatsApp is not connected" on a press that has nothing
    to do with WhatsApp. Comparing the state object itself is what separates a
    new answer from a redraw of the old one.
  */
  const announced = useRef(state);

  useEffect(() => {
    if (state === announced.current) return;
    announced.current = state;

    if (state.status === 'success') toast.success(labels.sent);
    else if (state.status === 'error') toast.error(t(`errors.${state.messageKey}`));
  }, [state, t, labels.sent]);

  const owes = remainingMinor > 0;

  return (
    <Popover>
      {/*
        The same `TooltipHint` every other mark on this row carries. The menu is
        the surface with the words in it; the trigger only has to say what
        opening it gets you.
      */}
      <TooltipHint label={labels.more} className="shrink-0">
        <PopoverTrigger
          aria-label={labels.more}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), ROW_ACTION_CLASS)}
        >
          <Icon name="moreActions" className="size-5" />
        </PopoverTrigger>
      </TooltipHint>

      {/*
        `align="end"` hangs the panel from the trigger's own edge, and Base UI
        resolves `end` logically — so this needs no `:dir()` and no Arabic
        branch. The same construction the register's own row menu uses.
      */}
      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        <form action={formAction} className="contents">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientId" value={clientId} />

          <ConfirmSubmitButton
            /*
              Confirmed for the reason the bill send is: this reaches somebody
              outside the clinic and WhatsApp has no unsend. Chasing the wrong
              subscriber for money is a worse thing to do by accident than any
              other control on this screen.
            */
            label={owes ? labels.reminder : labels.reminderNothing}
            confirmTitle={labels.confirmTitle}
            confirmMessage={labels.confirmBody}
            icon="notifications"
            variant="ghost"
            size="sm"
            className={MENU_ITEM_CLASS}
            disabled={!owes}
          />
        </form>

        <PrintBillButton
          href={`/${locale}/app/clients/bills/${clientId}/print`}
          label={labels.printAllFor}
          hint={labels.printAll}
          text={labels.printAll}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), MENU_ITEM_CLASS)}
          iconClassName="size-4"
        />
      </PopoverContent>
    </Popover>
  );
}
