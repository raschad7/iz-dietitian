'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveServicePricesAction } from '@/features/billing/actions';
import { initialBillingFormState } from '@/features/billing/form-state';
import { toPriceInput, toPriceValue } from '@/features/billing/money';
import { BILLING_SERVICES, type BillingService, type ServicePrices } from '@/features/billing/services';
import { SettingsEditDialog } from '@/features/settings/components/settings-edit-dialog';
import { SettingsRow, SettingsSection } from '@/features/settings/components/settings-section';
import { currencySymbol } from '@/lib/format';
import type { Locale } from '@/i18n/routing';

/**
 * What the clinic charges: one row naming the prices, and one control that
 * opens them.
 *
 * The dietitian sets these; nothing else does. There is no default price and no
 * suggested one — a clinic's rates are its own, and a figure this app invented
 * would be a figure somebody eventually charged a subscriber by not noticing.
 *
 * ## Why the fields moved into a dialog, behind one control
 *
 * They were three live inputs sitting open on the tab, with a Save button that
 * appeared on the first edited digit. That is a form on a page nobody came to
 * fill in: a settings tab is opened far more often to *check* what the clinic
 * charges than to change it, and a page of open inputs makes every visit look
 * like unfinished work — and gives a stray keystroke somewhere to hide.
 *
 * So it reads like every other row on this page now: a row that says what it
 * is, and one control that opens it. Reading is the default and writing is
 * deliberate. The control sits in the row's action slot, which puts it at the
 * far end of the line — the left in Arabic, the right in English — where every
 * other Change on this page already is.
 *
 * `SettingsEditDialog` brings the rest with it: the open state, the pending
 * state, the close on success, and the re-keyed form that makes every opening
 * start from what is stored. The old component owned all four, plus a
 * `changed` comparison and a toast, to say what a dialog says by closing.
 *
 * ## One dialog, three fields
 *
 * The rest of this page edits one field per dialog, because its rows are one
 * fact each. These three are one decision — what the clinic charges — and are
 * read against each other: a consultation priced above a month's subscription
 * is a mistake you see by looking at the three together, and never by opening
 * them one at a time.
 *
 * ## An empty field is "no price"
 *
 * Not zero. Clearing one takes the price back off the service; zero stays a
 * real answer for a service the clinic gives away — a field left blank and a
 * field holding `0` mean different things and are stored differently.
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

  return (
    <SettingsSection
      title={t('prices.title')}
      description={t('prices.description')}
      icon="recordCharge"
    >
      {/*
        One row, and it names the subject rather than listing it: the three
        services and their rates are what the dialog is for, and a row that
        recited them would be the editor's contents written out twice — once as
        text nobody can change and once as fields.

        So there is a single control, where there were three that all opened the
        same editor. Three Changes down a column read as three separate
        decisions; the prices are one.
      */}
      <SettingsRow
        label={t('prices.rowLabel')}
        /* Nothing to state. The section's own description says what these are
           and the dialog holds the figures. */
        value={null}
        action={<PricesDialog locale={locale} prices={prices} />}
      />
    </SettingsSection>
  );
}

/** The editor: every rate at once, behind one Change. */
function PricesDialog({ locale, prices }: { locale: Locale; prices: ServicePrices }) {
  const t = useTranslations('billing');

  return (
    <SettingsEditDialog
      locale={locale}
      title={t('prices.title')}
      triggerLabel={t('prices.edit')}
      /* "Change" alone is enough here — it is the only control in the section
         and its row names what it changes. */
      action={saveServicePricesAction}
      initialState={initialBillingFormState}
    >
      {(state) => (
        <>
          {BILLING_SERVICES.map((service) => (
            <PriceField
              key={service.value}
              locale={locale}
              service={service.value}
              label={t(`services.${service.value}`)}
              stored={prices[service.value]}
              invalid={state.status === 'error'}
            />
          ))}

          {/*
            One line for the whole form — the action reports a single message
            key, and the first field that does not parse stops the write, so
            there is never more than one thing to say. The dialog's own
            catch-all sits under this and says nothing more specific.
          */}
          {state.status === 'error' ? <FieldError>{t(`errors.${state.messageKey}`)}</FieldError> : null}
        </>
      )}
    </SettingsEditDialog>
  );
}

/**
 * One service's label and its field.
 *
 * Holds its own value in state rather than reading up: the dialog is re-keyed
 * on every opening — see `SettingsEditDialog` — so mounting with the stored
 * price is the same thing as resetting to it, and nothing here has to remember
 * that a dismissed edit must be forgotten.
 */
function PriceField({
  locale,
  service,
  label,
  stored,
  invalid,
}: {
  locale: Locale;
  service: BillingService;
  label: string;
  /** What is stored, in minor units. `null` for a service with no price. */
  stored: number | null;
  invalid: boolean;
}) {
  const id = `price-${service}`;
  const [value, setValue] = useState(stored === null ? '' : toPriceValue(stored));

  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="min-w-0 flex-1 font-normal">
        {label}
      </Label>

      {/*
        `dir="ltr"` on the box, so the logical edges inside it resolve the way
        the figure reads rather than the way the page does. The symbol then sits
        at the physical left and the digits flush right in Arabic as in English
        — without a single physical property, which this repo rules out for good
        reason: see `docs/design-system.md`.
      */}
      <div dir="ltr" className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-0 grid w-6 place-items-center text-body-sm text-muted-foreground"
        >
          {currencySymbol(locale)}
        </span>

        {/*
          Sized to what it holds: four digits and the symbol, and no more.
          `w-20` is that sum — a 24px symbol slot, four tabular figures, and the
          padding either side — which is why both paddings are named here rather
          than left to the input scale's `px-5`. Width is the *box*, not the
          content: an earlier `w-[8ch]` set the box to the width the digits
          alone need, left about two characters of room once the symbol and the
          end padding came out of it, and showed `9999` as `99`.

          A text input and not `type="number"`, for the reason every amount in
          this feature is one: a spinner changes money on a scroll of the wheel
          over the field, `1e3` is accepted, and the browser's per-locale
          decimals silently disagree with what the server parses. `parseAmount`
          reads this — the same function the schema runs.
        */}
        <PriceInput id={id} value={value} invalid={invalid} onValueChange={setValue} />
      </div>
    </div>
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
