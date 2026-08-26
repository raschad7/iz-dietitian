'use client';

import { useTranslations } from 'next-intl';

import { recordChargeAction } from '@/features/billing/actions';
import { BillingKeypadDialog } from '@/features/billing/components/billing-keypad-dialog';
import { BILLING_SERVICES, CONSULTATION, type ServicePrices } from '@/features/billing/services';
import {
  isSubscriptionService,
  type Subscription,
} from '@/features/billing/subscription';
import type { Locale } from '@/i18n/routing';

/**
 * "Add a charge" — the banknote beside the wallet on every Bills row.
 *
 * The other half of the ledger, and the half without which the screen cannot
 * work: `Total price` is the sum of `client_charges`, so with no way to add one
 * every subscriber would sit at ₪0 billed for ever and the payment side would
 * have nothing to be measured against.
 *
 * The card is `BillingKeypadDialog` — the same one the wallet opens, to the
 * pixel. It was a stack of labelled fields before, with the amount as one input
 * among four; a clinic recording a visit and the payment for it in the same
 * minute met two different cards for one event.
 *
 * ## The price is the clinic's own
 *
 * The card asks which service; the amount follows from it. Prices are set once
 * in Settings and read here, so a charge cannot be recorded at a figure nobody
 * decided, and the rate does not have to be remembered — or typed — at the
 * counter. A service with no price yet cannot be charged at all: the card says
 * where to set one and the button will not commit until it is there. Recording
 * a visit at ₪0 because the list was blank is the failure this prevents.
 *
 * What is stored is still the *figure and the words*, copied onto the row, not
 * a key into the price list. Raising the monthly rate next year cannot rewrite
 * what somebody was told they owed last March — see `clinic_service_prices`.
 *
 * ## The first consultation is free
 *
 * Every subscriber's first consultation is recorded at zero; every one after it
 * is charged at the rate in Settings. The card decides which it is looking at —
 * `consulted` is true when the ledger already holds a consultation — and says
 * so on the card, because a charge of ₪0 that does not explain itself reads as
 * a price somebody forgot to set.
 *
 * **The entry is still made.** A free first visit is written down at zero
 * rather than skipped: "it happened and was not billed" is a fact the ledger
 * has to be able to state, and it is also what makes the *second* consultation
 * chargeable — the row is how the next card knows.
 *
 * ## One subscription at a time
 *
 * A subscriber inside a term cannot be sold another one until it has run — the
 * clinic would be charging twice for the same days. Both subscription options
 * are greyed out while that is true, each saying the day the current term ends,
 * and the card opens on the consultation instead: a visit is not a term, and
 * somebody mid-subscription can still be charged for one.
 *
 * **The card is not where the rule is true.** `recordCharge` refuses the write
 * as well, which is what covers a back-dated entry, a second dietitian on the
 * same subscriber, and a posted form that never met this card. Here it is only
 * shown early, which is the difference between a rule and an error message.
 *
 * What is greyed is judged against *today*. The card lets the date be changed,
 * so a reader can move a charge into a week the term does not cover and the
 * server will accept it — the options are the common answer, the write path is
 * the correct one.
 *
 * ## The first consultation
 *
 * The rule is applied here rather than in the action, and that is a real
 * limitation worth naming: two dietitians recording a first consultation for
 * the same subscriber at the same moment would both see a free one. The ledger
 * stays correct — two zero charges, not one — and the fix, if it ever matters,
 * is the same check inside `recordCharge`.
 */

export function RecordChargeDialog({
  locale,
  clientId,
  clientName,
  /** Today, in the clinic's zone, resolved on the server. See the Bills page. */
  today,
  /** `button` for a panel with room for words; `icon` for a register row. */
  trigger,
  triggerClassName,
  /** What the clinic charges, from Settings. `null` for a service with no price. */
  prices,
  /** Whether this subscriber's ledger already holds a consultation. */
  consulted,
  /** Where their subscription stands today — see `subscriptionStanding`. */
  subscription,
}: {
  locale: Locale;
  clientId: string;
  clientName: string;
  today: string;
  trigger?: 'icon' | 'button';
  triggerClassName?: string;
  prices: ServicePrices;
  consulted: boolean;
  subscription: Subscription;
}) {
  const t = useTranslations('billing');

  /*
    Whether a term already covers today — the whole of what the card needs to
    know. It used to read the countdown too, to say **91 days remaining** under
    a greyed row; the row is greyed, which is the same fact in the form the eye
    already has. A sentence under it spends a line explaining a state the
    control is in, on a card that is open for one decision.
  */
  const covered = subscription.state === 'active';

  return (
    <BillingKeypadDialog
      locale={locale}
      clientId={clientId}
      today={today}
      trigger={trigger}
      triggerClassName={triggerClassName}
      icon="recordCharge"
      action={recordChargeAction}
      /*
        The chosen service posts as `description`, which is the column the free
        text used to fill and the field `recordChargeSchema` still requires. The
        label travels, not the key: `description` is what the ledger prints and
        what the printed bill reads back, and a row saying `followUp` on paper
        would be the catalogue leaking onto a document a subscriber keeps.
      */
      options={BILLING_SERVICES.map((service) => {
        const label = t(`services.${service.value}`);

        /*
          `value` is what the form posts and `label` is what the card shows; for
          a service they are the same string, because the thing being posted *is*
          the words. A payment's pill differs — it shows Cash and posts
          `cash` — which is why the two are separate fields at all.
        */
        /*
          The first consultation is free, whatever the price list says — and it
          is free even when the list says nothing, which is why this is a zero
          rather than a fall-through to `prices`.
        */
        const free = service.value === CONSULTATION && !consulted;

        /* A term already covers today, and this row is another one. */
        const blocked = covered && isSubscriptionService(service.value);

        return {
          ...service,
          value: label,
          label,
          amountMinor: free ? 0 : prices[service.value],
          /* The key beside the words: what the rule above will read next time. */
          posts: { service: service.value },
          disabled: blocked,
          /*
            The one line a row can carry, and it is only ever the free
            consultation's. A blocked subscription says what it is by being
            unselectable.
          */
          note: free ? t('recordCharge.firstFree') : undefined,
        };
      })}
      optionName="description"
      dateName="chargedOn"
      /*
        No keypad. A charge here says which service was given, and nothing about
        money — the amount goes in on the payment side, where it is actually
        handed over. See `amount` on the shared card for what that posts.
      */
      amount={false}
      labels={{
        title: t('recordCharge.title'),
        open: t('recordCharge.open'),
        openFor: t('recordCharge.openFor', { name: clientName }),
        close: t('recordCharge.close'),
        option: t('recordCharge.service'),
        date: t('recordCharge.chargedOn'),
        datePlaceholder: t('recordCharge.datePlaceholder'),
        openDatePicker: t('recordCharge.openDatePicker'),
        answer: t('recordCharge.addedTotal'),
        noPrice: t('recordCharge.noPrice'),
        submit: t('recordCharge.submit'),
        saving: t('recordCharge.saving'),
        saved: t('recordCharge.saved'),
      }}
    />
  );
}
