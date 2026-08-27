'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';

import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { toast } from '@/components/ui/toast';
import { sendBillWhatsappAction } from '@/features/billing/actions';
import { ROW_ACTION_CLASS } from '@/features/billing/components/row-action';
import { initialBillingFormState } from '@/features/billing/form-state';
import type { Locale } from '@/i18n/routing';

/**
 * Sends a subscriber a bill on WhatsApp — one operation, or the whole account.
 *
 * The same PDF the printer beside it produces — see `sendBillWhatsappAction`,
 * which renders it through `renderBill` rather than composing a second document
 * that would have to be kept in step with the first.
 *
 * ## Two shapes, and they follow the printer's
 *
 * A mark in a row, where controls share a cell and none has width for words; a
 * labelled button wherever there is room — the record's Expenses tab, beside
 * Export bills. `PrintBillButton` makes exactly this distinction and for
 * exactly this reason, and the two sit next to each other in both places, so
 * they had better not disagree about which of them is an icon.
 *
 * `entryId` picks one operation; omitting it sends the statement.
 *
 * ## It asks first
 *
 * Every other mark in this row opens something the reader can back out of: a
 * dialog with a Cancel, a print preview they can dismiss. This one puts a
 * document on somebody's phone, and **WhatsApp has no unsend** — a slip of the
 * cursor one row up sends a stranger's account to the wrong person, and nothing
 * afterwards can take it back. So it goes through `ConfirmSubmitButton`, which
 * names the subscriber in the question: the confirm step is the last chance to
 * notice you are on the wrong row, and a row is exactly the thing that is easy
 * to be wrong about on a table of near-identical lines.
 *
 * That component also gives the button the same `TooltipHint` the printer next
 * to it carries, so the pair still reads as peers on the way in.
 *
 * ## Why a form and not an `onClick`
 *
 * `useActionState` is what every other control in this feature uses, and it
 * gives the three things a send needs for free: a pending flag while the PDF is
 * rendered and uploaded, a result that survives the round trip, and a POST that
 * works before hydration. `ConfirmSubmitButton` re-submits this form once the
 * question is answered.
 */
export function SendBillButton({
  locale,
  clientId,
  entryId,
  latest = false,
  /** As it is stored. Absent, there is nowhere to send and the button is held. */
  phone,
  labels,
  text = false,
  className,
  iconClassName,
}: {
  locale: Locale;
  clientId: string;
  /** One bill. Omitted, the whole account goes — see `renderBill`. */
  entryId?: string;
  /**
   * Send the subscriber’s most recent bill, without this having to know
   * which one that is.
   *
   * For the Bills row, which holds a subscriber and no ledger. The action
   * resolves it against the account it is already reading — see the `latest`
   * argument on `renderBill`. `entryId` wins if both arrive, being the more
   * specific request.
   */
  latest?: boolean;
  phone: string | null;
  /**
   * Set on the labelled shape. The words themselves are `labels.action` —
   * `ConfirmSubmitButton` shows them beside the glyph whenever the size is not
   * an icon size, and uses them for the confirm button too. This only chooses
   * which shape to draw.
   */
  text?: boolean;
  className?: string;
  iconClassName?: string;
  labels: {
    /** The tooltip, the accessible name, and the confirm button's own words. */
    action: string;
    /** The question, short. */
    confirmTitle: string;
    /** What is about to happen, naming the subscriber. */
    confirmBody: string;
    sent: string;
  };
}) {
  const t = useTranslations('billing');
  const [state, formAction] = useActionState(sendBillWhatsappAction, initialBillingFormState);

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

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      {/* Absent for the statement. An empty value would be a request for a bill
          with no id; the action reads one as the other. */}
      {entryId ? <input type="hidden" name="entryId" value={entryId} /> : null}
      {/* Named, rather than implied by the absence of an id: "the account"
          and "the newest bill on it" are two different documents, and a form
          that said neither would be asking the action to guess. */}
      {latest ? <input type="hidden" name="scope" value="latest" /> : null}

      <ConfirmSubmitButton
        label={labels.action}
        confirmTitle={labels.confirmTitle}
        confirmMessage={labels.confirmBody}
        icon="sendBill"
        /*
          A labelled button is a peer of the printer next to it and is outlined
          like one; a mark in a row is the quiet grey the row's other marks
          wear. The same split `PrintBillButton` makes.
        */
        variant={text ? 'outline' : 'ghost'}
        size={text ? 'default' : 'icon'}
        className={className ?? (text ? undefined : ROW_ACTION_CLASS)}
        iconClassName={iconClassName}
        /* Nothing to send to. Asking first and then failing on a missing number
           would be a question whose answer never mattered. */
        disabled={!phone}
      />
    </form>
  );
}
