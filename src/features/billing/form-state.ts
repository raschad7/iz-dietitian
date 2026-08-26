/**
 * What the billing dialogs know between submissions.
 *
 * One state type for both — recording a charge and recording a payment are the
 * same shape of interaction against the same ledger, and two near-identical
 * unions would drift the first time an error key was added to one of them.
 *
 * A message *key* and never a sentence: the actions run on the server and the
 * dialogs are bilingual, so the string is chosen by `useTranslations` in the
 * component. An action returning English text would post English into an Arabic
 * dialog.
 *
 * Every key here has an entry under `billing.errors` in both message files.
 */
export type BillingFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      messageKey:
        | 'genericError'
        | 'amountRequired'
        /** Typed something that is not an amount — `12.345`, `abc`. */
        | 'invalidAmount'
        /** A payment of nothing is a slip, not a fact. Charges may be zero. */
        | 'amountZero'
        /** A charge cannot be negative — that is a refund, and it is a payment. */
        | 'amountNegative'
        | 'amountTooLarge'
        | 'invalidDate'
        | 'noteTooLong'
        /** A charge has to say what it is for. */
        | 'descriptionRequired'
        | 'descriptionTooLong'
        /** The subscriber is not this clinic's — see `ClientNotInClinicError`. */
        | 'invalidClient'
        /** A price was submitted for a service the app does not offer. */
        | 'invalidService'
        /**
         * A subscription was charged over one that is still running — see
         * `SubscriptionActiveError`.
         */
        | 'subscriptionActive'
        /**
         * More money was received than the account owes — see
         * `PaymentExceedsBalanceError`.
         */
        | 'paymentExceedsBalance'
        /**
         * The bill could not be sent on WhatsApp. One key for every reason —
         * no number on the record, a number with no WhatsApp account, a
         * session nobody has paired, a gateway that refused — because the
         * dietitian's next move is the same in all of them: send it another
         * way, and tell whoever looks after the connection. The specific
         * reason is in the message log, where it can be acted on.
         */
        | 'billNotSent'
        /**
         * A payment reminder was asked for on an account that owes nothing.
         * The menu greys the item out, so reaching this means the form was
         * posted around it or the debt was settled in between.
         */
        | 'nothingOutstanding'
        /**
         * WhatsApp is not usable right now — never configured, or configured
         * and not paired with a phone. One key for both, because the dietitian
         * cannot tell them apart and does not act on the difference: somebody
         * has to go to Settings → WhatsApp and connect it.
         */
        | 'whatsappNotConnected'
        /** The record has no phone number, so there is nowhere to send. */
        | 'clientHasNoPhone'
        /** The number is real, and WhatsApp says nobody is registered on it. */
        | 'clientNotOnWhatsapp';
    };

export type BillingErrorKey = Extract<BillingFormState, { status: 'error' }>['messageKey'];

export const initialBillingFormState: BillingFormState = { status: 'idle' };
