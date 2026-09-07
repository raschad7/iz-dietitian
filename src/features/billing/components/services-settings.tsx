'use client';

import { useLayoutEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Switch } from '@/components/ui/switch';
import { createServiceAction, deleteServiceAction, updateServiceAction } from '@/features/billing/actions';
import { initialBillingFormState, type BillingFormState } from '@/features/billing/form-state';
import { formatAmountCompact, toPriceInput, toPriceValue } from '@/features/billing/money';
import { serviceName, type ClinicServiceView, type ServiceKind } from '@/features/billing/services';
import { SettingsEditDialog } from '@/features/settings/components/settings-edit-dialog';
import {
  SettingsEmptyValue,
  SettingsRow,
  SettingsSection,
} from '@/features/settings/components/settings-section';
import { currencySymbol } from '@/lib/format';
import type { Locale } from '@/i18n/routing';

/**
 * What the clinic sells, and what it charges for it.
 *
 * The dietitian owns this list. There is no default price and no suggested one
 * — a clinic's rates are its own, and a figure this app invented would be a
 * figure somebody eventually charged a subscriber by not noticing.
 *
 * ## What changed, and why the screen looks different
 *
 * It used to be three fixed rows — a month, three months, a consultation — with
 * one dialog holding three price boxes. The names were in the message catalogue
 * and the list was in code, so a clinic that sold a two-month subscription could
 * not record one until somebody shipped a release.
 *
 * Now a service is a row a clinic writes: a name, whether it is a term or a
 * visit, how many months a term runs, a price, and whether the first one is
 * free. Adding a year, a fortnightly follow-up or a package is this screen and
 * nothing else.
 *
 * ## The section still reads and the dialogs still write
 *
 * The old note holds and is why the shape survived the change: a settings tab is
 * opened far more often to *check* what the clinic charges than to change it, so
 * a page of live inputs makes every visit look like unfinished work. Each
 * service states itself in a row; Change opens that one service's editor; Add a
 * service opens an empty one.
 *
 * **One dialog per service, where the prices used to share one.** Three prices
 * were one decision — you read them against each other — but a service is a
 * whole small record with a name, a kind and a term, and five of those in one
 * dialog is a form nobody can hold in their head. The figures are still read
 * against each other in the rows, which is where that comparison actually
 * happens.
 *
 * ## Changing a price does not change a bill
 *
 * These are the *current* rates. A charge already on a subscriber's ledger keeps
 * the amount and the words it was recorded with — see the note on
 * `clinic_services` — so raising the monthly rate next year cannot rewrite what
 * somebody was told they owed last March. That is why nothing here offers to
 * apply a new price to anything already entered.
 */
export function ServicesSettings({
  locale,
  services,
}: {
  locale: Locale;
  services: readonly ClinicServiceView[];
}) {
  const t = useTranslations('billing');

  return (
    <SettingsSection
      title={t('prices.title')}
      description={t('prices.description')}
      icon="recordCharge"
      /*
        Add belongs to the section rather than to any row, so it sits in the
        section's own action slot — the same place the working-hours table puts
        the control that governs its whole group.
      */
      action={<ServiceDialog locale={locale} />}
    >
      {services.length === 0 ? (
        <p className="py-4 text-body-sm text-muted-foreground">{t('prices.empty')}</p>
      ) : (
        services.map((service) => (
          <SettingsRow
            key={service.id}
            label={serviceName(service, locale)}
            /*
              What kind of thing this is, under its name: a term and how long it
              runs, or a visit. Plus the two facts that change what the charge
              card does with it — the free first, and whether it is still
              offered — because both are invisible otherwise and both are the
              sort of thing somebody sets once and later wonders about.
            */
            description={describe(service, t)}
            value={
              service.priceMinor === null ? (
                /*
                  A dash carrying the words as its accessible name — this page's
                  convention for a value nobody has set. It must not be `₪0`:
                  zero is a real answer for a service the clinic gives away, and
                  the two are stored differently.
                */
                <SettingsEmptyValue label={t('prices.unpriced')} />
              ) : (
                formatAmountCompact(locale, service.priceMinor)
              )
            }
            /* An amount runs left to right in Arabic as in English; it is the
               row around it that mirrors. The unset dash has no direction of
               its own, so it does not take the isolation. */
            isolate={service.priceMinor !== null}
            action={<ServiceDialog locale={locale} service={service} />}
          />
        ))
      )}
    </SettingsSection>
  );
}

/** The line under a service's name: what it is, and the two rules it carries. */
function describe(
  service: ClinicServiceView,
  t: ReturnType<typeof useTranslations<'billing'>>,
): string {
  const parts = [
    service.kind === 'subscription' && service.durationMonths !== null
      ? t('services.term', { months: service.durationMonths })
      : t('services.visit'),
  ];

  if (service.firstFree) parts.push(t('services.firstFree'));
  if (!service.active) parts.push(t('services.retired'));

  return parts.join(' · ');
}

/**
 * One service's editor — the same dialog for adding and for changing.
 *
 * They differ in the action they post to, the id they carry and whether the
 * fields start empty; everything else about the two is identical, and two
 * components would be two places to add the next field to.
 *
 * The key is never a field. It is what the ledger recorded — see
 * `clinic_services` — and a clinic renaming a service must not detach the
 * charges that name it.
 */
function ServiceDialog({ locale, service }: { locale: Locale; service?: ClinicServiceView }) {
  const t = useTranslations('billing');
  const editing = service !== undefined;

  return (
    <SettingsEditDialog
      locale={locale}
      title={editing ? t('services.editTitle') : t('services.addTitle')}
      triggerLabel={editing ? t('prices.edit') : t('services.add')}
      triggerAriaLabel={editing ? t('services.editFor', { name: serviceName(service, locale) }) : undefined}
      hiddenFields={editing ? { serviceId: service.id } : undefined}
      action={editing ? updateServiceAction : createServiceAction}
      initialState={initialBillingFormState}
      /*
        Deleting sits apart from Cancel and Save because it is not one of the
        two ways out of an edit — it is a third decision about the thing being
        edited. Only on an existing service: there is nothing to delete from an
        empty form.
      */
      footerStart={editing ? <DeleteService locale={locale} service={service} /> : undefined}
    >
      {(state) => <ServiceFields locale={locale} service={service} state={state} />}
    </SettingsEditDialog>
  );
}

/** The fields, in the order a service is decided in: what it is called, what it is, what it costs. */
function ServiceFields({
  locale,
  service,
  state,
}: {
  locale: Locale;
  service?: ClinicServiceView;
  state: BillingFormState;
}) {
  const t = useTranslations('billing');
  const [kind, setKind] = useState<ServiceKind>(service?.kind ?? 'subscription');
  const [months, setMonths] = useState(service?.durationMonths?.toString() ?? '1');
  const [price, setPrice] = useState(service?.priceMinor == null ? '' : toPriceValue(service.priceMinor));
  const [firstFree, setFirstFree] = useState(service?.firstFree ?? false);
  const [active, setActive] = useState(service?.active ?? true);

  const invalid = state.status === 'error';

  return (
    <>
      {/*
        Both names, and neither is required on its own — see `serviceSchema`.
        The clinic works in Arabic and should not have to write English to add a
        service; the English box is there for the staff who read the interface
        in it, and is filled from the Arabic when it is left empty.
      */}
      <TextField
        id="service-name-ar"
        name="nameAr"
        label={t('services.nameAr')}
        defaultValue={service?.nameAr ?? ''}
        invalid={invalid}
        autoFocus={!service}
      />
      <TextField
        id="service-name-en"
        name="nameEn"
        label={t('services.nameEn')}
        defaultValue={service?.nameEn ?? ''}
        invalid={invalid}
        dir="ltr"
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="service-kind">{t('services.kind')}</Label>
        <SelectField
          id="service-kind"
          name="kind"
          value={kind}
          onValueChange={setKind}
          options={[
            { value: 'subscription', label: t('services.kindSubscription') },
            { value: 'visit', label: t('services.kindVisit') },
          ]}
        />
      </div>

      {/*
        The term, and only for a subscription — a visit covers no days, so a
        months box beside it would be a field with no answer. It is unmounted
        rather than disabled so nothing is posted: `serviceSchema` refuses a
        visit that carries a term rather than quietly dropping it.
      */}
      {kind === 'subscription' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="service-months">{t('services.durationMonths')}</Label>
          <Input
            id="service-months"
            name="durationMonths"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            value={months}
            onChange={(event) => setMonths(event.target.value.replace(/[^\d]/g, '').slice(0, 2))}
            className="w-20 text-end tabular-nums"
            aria-invalid={invalid}
          />
          {/*
            Said here because it is genuinely surprising: a term end is derived
            from the charge and this number, never stored, so correcting the
            number corrects every term ever sold under this service — including
            the ones already running. That is the property that lets a mistake be
            fixed everywhere at once, and it is worth knowing before pressing
            Save rather than after.
          */}
          <p className="text-caption text-muted-foreground">{t('services.termAffectsExisting')}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="service-price" className="min-w-0 flex-1 font-normal">
          {t('services.price')}
        </Label>

        {/*
          `dir="ltr"` on the box, so the logical edges inside it resolve the way
          the figure reads rather than the way the page does. The symbol then
          sits at the physical left and the digits flush right in Arabic as in
          English — without a single physical property.
        */}
        <div dir="ltr" className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 start-0 grid w-6 place-items-center text-body-sm text-muted-foreground"
          >
            {currencySymbol(locale)}
          </span>

          <PriceInput id="service-price" value={price} invalid={invalid} onValueChange={setPrice} />
        </div>
      </div>

      {/* An empty price is "not decided", which is not the same as free. */}
      <p className="text-caption text-muted-foreground">{t('services.priceBlank')}</p>

      <SwitchRow
        name="firstFree"
        label={t('services.firstFreeLabel')}
        hint={t('services.firstFreeHint')}
        checked={firstFree}
        onChange={setFirstFree}
      />

      {/*
        Offered, rather than "active": what the switch governs is whether this
        appears on the charge card. Turning it off leaves every charge that
        names it exactly as it is — which is the whole reason retiring exists
        beside deleting.
      */}
      <SwitchRow
        name="active"
        label={t('services.offered')}
        hint={t('services.offeredHint')}
        checked={active}
        onChange={setActive}
      />

      {state.status === 'error' ? <FieldError>{t(`errors.${state.messageKey}`)}</FieldError> : null}
    </>
  );
}

/** A labelled text box, which two of these fields are and neither is interesting. */
function TextField({
  id,
  name,
  label,
  defaultValue,
  invalid,
  dir,
  autoFocus,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  invalid: boolean;
  dir?: 'ltr';
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        autoComplete="off"
        dir={dir}
        autoFocus={autoFocus}
        aria-invalid={invalid}
      />
    </div>
  );
}

/**
 * A switch and the hidden input that posts it.
 *
 * `Switch` is a `button` rather than a checkbox — see its own file — so the
 * value a form sends is the hidden input beside it, exactly as the clinic's
 * working-week table does it.
 */
function SwitchRow({
  name,
  label,
  hint,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const labelId = `${name}-label`;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p id={labelId} className="text-body-sm">
          {label}
        </p>
        <p className="text-caption text-muted-foreground">{hint}</p>
      </div>

      <input type="hidden" name={name} value={checked ? 'on' : 'off'} />
      <Switch checked={checked} aria-labelledby={labelId} onClick={() => onChange(!checked)} />
    </div>
  );
}

/**
 * Removes a service, when nothing has ever been charged under it.
 *
 * The server refuses one with charges behind it — see `deleteService` — and the
 * refusal is what this reports, rather than the button being hidden on a
 * condition this component cannot check. Retiring is the answer in that case,
 * and it is the switch two rows up.
 */
function DeleteService({ locale, service }: { locale: Locale; service: ClinicServiceView }) {
  const t = useTranslations('billing');
  const [pending, start] = useTransition();
  const [refused, setRefused] = useState(false);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await deleteServiceAction(locale, service.id);
            setRefused(result.status === 'error');
          })
        }
      >
        {t('services.delete')}
      </Button>

      {refused ? <FieldError>{t('errors.serviceInUse')}</FieldError> : null}
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
 * position in the filtered string. `useLayoutEffect` and not `useEffect` — this
 * has to happen in the same paint as the new value, or the caret is visibly
 * somewhere else first.
 *
 * ## The direction is the amount's, not the page's
 *
 * `dir="ltr"`, in Arabic as in English. An amount runs left to right in both
 * scripts — 1,250 is one thousand two hundred and fifty either way — so
 * selection, Backspace and the arrow keys all move along the figure the same way
 * in both languages. It is the box around it that mirrors, not the number inside
 * it.
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
      name="price"
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      value={value}
      /* A number, not a sentence: the placeholder stands for the shape of the
         answer, where a worded one described the row's state in words the label
         and the empty field already say between them. */
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
      className="h-9 w-24 ps-6 pe-2 text-end tabular-nums"
      aria-invalid={invalid}
    />
  );
}
