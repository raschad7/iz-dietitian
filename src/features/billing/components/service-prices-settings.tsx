'use client';

import { useActionState, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { saveServicePricesAction } from '@/features/billing/actions';
import { initialBillingFormState } from '@/features/billing/form-state';
import { toPriceInput, toPriceValue } from '@/features/billing/money';
import { BILLING_SERVICES, type BillingService, type ServicePrices } from '@/features/billing/services';
import { SettingsSection } from '@/features/settings/components/settings-section';
import { currencySymbol } from '@/lib/format';
import type { Locale } from '@/i18n/routing';

/**
 * What the clinic charges, one line per service.
 *
 * The dietitian sets these; nothing else does. There is no default price and no
 * suggested one — a clinic's rates are its own, and a figure this app invented
 * would be a figure somebody eventually charged a subscriber by not noticing.
 *
 * ## The button is not there until there is something to save
 *
 * A Save control on an untouched form is a button that does nothing, sitting
 * under three fields nobody has changed — and once a reader has seen it do
 * nothing, it stops reading as the thing that commits their work. It appears on
 * the first edited digit and goes when the write lands, so its presence *is*
 * the message "you have unsaved prices".
 *
 * This is also why the fields no longer save themselves on blur. Auto-save is
 * right where the value is the reader's own note; a price is what a subscriber
 * will be charged, and committing that on the way past a field is a decision
 * nobody made.
 *
 * ## An empty field is "no price"
 *
 * Not zero. Clearing one takes the price back off the service; zero stays a real
 * answer for a service the clinic gives away.
 *
 * ## Changing a price does not change a bill
 *
 * These are the *current* rates. A charge already on a subscriber's ledger keeps
 * the amount and the words it was recorded with — see the note on
 * `clinic_service_prices` — so raising the monthly rate next year cannot rewrite
 * what somebody was told they owed last March. That is why nothing here offers
 * to apply a new price to anything already entered.
 */
export function ServicePricesSettings({
  locale,
  prices,
}: {
  locale: Locale;
  prices: ServicePrices;
}) {
  const t = useTranslations('billing');
  const [state, formAction, pending] = useActionState(saveServicePricesAction, initialBillingFormState);

  /**
   * What is stored, as the fields draw it.
   *
   * Read from the props on every render rather than kept as a second copy in
   * state. `revalidatePath` re-renders this section with the row the write just
   * made, so the baseline the button is measured against is the database's own
   * answer — and it is right again after the *second* save as much as the
   * first. A remembered baseline was not: the action returns `success` both
   * times, so nothing in the state changed to react to, and the button sat
   * there after every save but the first.
   */
  const stored = Object.fromEntries(
    BILLING_SERVICES.map((service) => {
      const price = prices[service.value];
      return [service.value, price === null ? '' : toPriceValue(price)];
    }),
  ) as Record<BillingService, string>;

  /* What is on screen. Controlled, so `toPriceInput` can drop anything that is
     not part of an amount as the key lands. */
  const [values, setValues] = useState(stored);

  /*
    The save's own moment, taken from the edge of `pending` rather than from the
    status. Two saves in a row both end in `success`, so a status that has not
    changed is not the same as a submission that has not happened — watching the
    transition close is what fires once per press.

    It also re-reads the fields from what was stored. A rate typed `270.00` and
    stored as `27000` comes back as `270`; without this the field would keep the
    reader's spelling, disagree with the baseline, and leave the button up over
    a form with nothing left to save.
  */
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && state.status === 'success') {
      setValues(stored);
      toast.success(t('prices.saved'));
    }

    wasPending.current = pending;
    /* `stored` is derived from `prices` and `t` is stable per locale; neither is
       a reason to re-run a one-shot on the end of a submission. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state.status]);

  const changed = BILLING_SERVICES.some(
    (service) => values[service.value].trim() !== stored[service.value].trim(),
  );

  return (
    <SettingsSection title={t('prices.title')} description={t('prices.description')} icon="recordCharge">
      <form action={formAction}>
        <input type="hidden" name="locale" value={locale} />

        {BILLING_SERVICES.map((service) => {
          const id = `price-${service.value}`;

          return (
            <div key={service.value} className="flex items-center justify-between gap-4 py-3">
              <Label htmlFor={id} className="min-w-0 flex-1 font-normal">
                {t(`services.${service.value}`)}
              </Label>

              {/*
                `dir="ltr"` on the box, so the logical edges inside it resolve
                the way the figure reads rather than the way the page does. The
                symbol then sits at the physical left and the digits flush right
                in Arabic as in English — without a single physical property,
                which this repo rules out for good reason: see
                `docs/design-system.md`.
              */}
              <div dir="ltr" className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 start-0 grid w-6 place-items-center text-body-sm text-muted-foreground"
                >
                  {currencySymbol(locale)}
                </span>

                {/*
                  Sized to what it holds: four digits and the symbol, and no
                  more. `w-20` is that sum — a 24px symbol slot, four tabular
                  figures, and the padding either side — which is why both
                  paddings are named here rather than left to the input scale's
                  `px-5`. Width is the *box*, not the content: an earlier
                  `w-[8ch]` set the box to the width the digits alone need, left
                  about two characters of room once the symbol and the end
                  padding came out of it, and showed `9999` as `99`.

                  A text input and not `type="number"`, for the reason every
                  amount in this feature is one: a spinner changes money on a
                  scroll of the wheel over the field, `1e3` is accepted, and the
                  browser's per-locale decimals silently disagree with what the
                  server parses. `parseAmount` reads this — the same function the
                  schema runs.
                */}
                <PriceInput
                  id={id}
                  value={values[service.value]}
                  invalid={state.status === 'error'}
                  onValueChange={(next) =>
                    setValues((was) => ({ ...was, [service.value]: next }))
                  }
                />
              </div>
            </div>
          );
        })}

        {/*
          One line for the whole form — the action reports a single message key,
          and the first field that does not parse stops the write, so there is
          never more than one thing to say.
        */}
        {state.status === 'error' ? <FieldError>{t(`errors.${state.messageKey}`)}</FieldError> : null}

        {/*
          The button holds its own row rather than appearing between the fields
          and pushing them, and the row is only in the layout while there is
          something to commit — an empty reserved strip under three fields is a
          gap the eye keeps checking.
        */}
        {changed ? (
          <div className="flex justify-end pt-3">
            <Button type="submit" disabled={pending}>
              {pending ? t('prices.saving') : t('prices.save')}
            </Button>
          </div>
        ) : null}
      </form>
    </SettingsSection>
  );
}

/**
 * The price field: a text input that only ever holds an amount.
 *
 * ## Why it keeps the caret itself
 *
 * The value is filtered on every keystroke, so React re-renders the input with
 * a string the browser did not produce — and a controlled input handed a new
 * value puts the caret at the end. Typing at the end hides that; editing the
 * middle does not. Selecting the first two digits of `1250` and pressing
 * Backspace left `50` with the caret at the far end, so the next key landed
 * after the digits the reader was in the middle of replacing.
 *
 * It is worse in Arabic, and that is what this was reported as. A field whose
 * caret keeps jumping to "the end" reads as a field that deletes in the wrong
 * direction, because in an RTL page the reader is not expecting the end of an
 * LTR run to be on the right.
 *
 * So the caret is put back where the reader left it: count how much of what
 * they typed survives the filter *up to the caret*, and that count is the
 * position in the filtered string. `useLayoutEffect` and not `useEffect` —
 * this has to happen in the same paint as the new value, or the caret is
 * visibly somewhere else first.
 *
 * ## The direction is the amount's, not the page's
 *
 * `dir="ltr"`, in Arabic as in English. An amount runs left to right in both
 * scripts — 1,250 is one thousand two hundred and fifty either way — so
 * selection, Backspace and the arrow keys all move along the figure the same
 * way in both languages. It is the box around it that mirrors, not the number
 * inside it.
 */
function PriceInput({
  id,
  value,
  invalid,
  onValueChange,
}: {
  id: string;
  value: string;
  invalid: boolean;
  onValueChange: (next: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  /** Where the caret belongs once the filtered value has rendered. `null` when the browser's own position is right. */
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current === null) return;
    field.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  return (
    <Input
      ref={field}
      id={id}
      name={id}
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      value={value}
      /*
        A number, not a sentence. The placeholder stands for the shape of the
        answer — what a rate looks like — where a worded one described the
        row's state in words the label and the empty field already say between
        them.
      */
      placeholder="0"
      onChange={(event) => {
        const typed = event.target.value;
        const at = event.target.selectionStart ?? typed.length;

        /* How much of what precedes the caret survives the filter — the same
           filter, so the count cannot disagree with the value below. */
        const kept = toPriceInput(typed.slice(0, at)).length;
        const next = toPriceInput(typed);

        caret.current = Math.min(kept, next.length);
        onValueChange(next);
      }}
      className="h-9 w-20 ps-6 pe-2 text-end tabular-nums"
      aria-invalid={invalid}
    />
  );
}
