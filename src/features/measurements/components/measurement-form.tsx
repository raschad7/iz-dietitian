'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Field, FieldError, FieldHint } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TimeInput } from '@/components/ui/time-input';
import { HEIGHT_CM_RANGE, WEIGHT_KG_RANGE } from '@/features/clients/form-rules';
import { type Locale } from '@/i18n/routing';
import { type IsoDate } from '@/lib/iso-date';
import { cn } from '@/lib/utils';

import { saveMeasurementAction, updateMeasurementAction } from '../actions';
import { initialMeasurementFormState, type MeasurementFormState } from '../form-state';
import { type ParsedReport, type ParseWarning } from '../parse/types';
import { type RecordWarning } from '../report-state';
import { MEASUREMENT_MESSAGE_KEYS, type MeasurementMessageKey } from '../schema';

import { ReportSummary } from './report-upload';
import { ReportWarnings } from './report-warnings';

/**
 * The measurement form — the one way a reading enters the record by hand.
 *
 * ## Every figure but the weight is optional, and that is the point
 *
 * A bathroom scale reports one number and a body composition analyser reports
 * twenty. A form that demanded all twenty would be unusable on the day the
 * machine is out of order, and one that quietly filled the gaps with zero would
 * record a client with no body fat. So an empty box means "not measured" all
 * the way down to the column — see the `null`-not-zero note on
 * `client_measurements` — and the hint at the top says so, because a dietitian
 * looking at fourteen empty boxes will otherwise wonder whether they have to
 * guess.
 *
 * ## Field names are the schema's own keys
 *
 * `readForm` in `actions.ts` reads `Object.keys(schema.shape)`, so an input
 * named anything else is silently ignored — which is precisely the failure the
 * intake form's long warning describes. The names below are not free-form; each
 * one has to match its key on `measurementSchema`.
 */

const VALIDATION_VALUES = {
  weightMin: WEIGHT_KG_RANGE.min,
  weightMax: WEIGHT_KG_RANGE.max,
  heightMin: HEIGHT_CM_RANGE.min,
  heightMax: HEIGHT_CM_RANGE.max,
} as const;

function isMessageKey(value: string): value is MeasurementMessageKey {
  return (MEASUREMENT_MESSAGE_KEYS as readonly string[]).includes(value);
}

/** The figures, grouped the way the report itself is laid out. */
const GROUPS = [
  {
    key: 'core',
    fields: [
      { name: 'weightKg', unit: 'kg', step: '0.1', required: true },
      { name: 'heightCm', unit: 'cm', step: '0.1' },
    ],
  },
  {
    key: 'composition',
    fields: [
      { name: 'bodyFatPercent', unit: 'percent', step: '0.1' },
      { name: 'fatMassKg', unit: 'kg', step: '0.01' },
      { name: 'muscleMassKg', unit: 'kg', step: '0.01' },
      { name: 'fatFreeMassKg', unit: 'kg', step: '0.01' },
      { name: 'boneMassKg', unit: 'kg', step: '0.01' },
      { name: 'totalBodyWaterKg', unit: 'kg', step: '0.01' },
      { name: 'totalBodyWaterPercent', unit: 'percent', step: '0.1' },
    ],
  },
  {
    key: 'metabolism',
    fields: [
      { name: 'basalMetabolicRateKcal', unit: 'kcal', step: '1' },
      { name: 'visceralFatRating', unit: 'rating', step: '0.5' },
      { name: 'metabolicAge', unit: 'years', step: '1' },
    ],
  },
  {
    key: 'girth',
    fields: [
      { name: 'waistCm', unit: 'cm', step: '0.1' },
      { name: 'hipCm', unit: 'cm', step: '0.1' },
    ],
  },
] as const;

export type MeasurementFormValues = {
  id: string;
  measuredOn: IsoDate;
  measuredAtMinute: number;
  [figure: string]: string | number | null;
};

type MeasurementFormProps = {
  clientId: string;
  locale: Locale;
  today: IsoDate;
  /** `client_nutrition_profiles.weight_kg` — what the checkbox would replace. */
  currentWeightKg: number | null;
  /** Editing an existing reading. Absent creates a new one. */
  measurement?: MeasurementFormValues;
  /**
   * A report this form was filled from, when it was.
   *
   * **The confirm screen is this form.** There is no second screen for reviewing
   * an extraction: a machine-read measurement and a hand-typed one are the same
   * record with the same fields and the same rules, so they get the same form —
   * pre-filled here, empty otherwise. One form means the two can never drift
   * apart, and it is what makes supporting another machine a field map rather
   * than a screen.
   */
  report?: {
    parsed: ParsedReport;
    warnings: (ParseWarning | RecordWarning)[];
    file: File;
    fileName: string;
    found: number;
    total: number;
    onReplace: () => void;
  };
  onCancel: () => void;
  onSaved: (state: Extract<MeasurementFormState, { status: 'success' }>) => void;
};

export function MeasurementForm({
  clientId,
  locale,
  today,
  currentWeightKg,
  measurement,
  report,
  onCancel,
  onSaved,
}: MeasurementFormProps) {
  const t = useTranslations('measurements');
  const tCommon = useTranslations('common');

  const [state, formAction] = useActionState(
    measurement ? updateMeasurementAction : saveMeasurementAction,
    initialMeasurementFormState,
  );

  /*
    The date lives in React state because `DatePicker` is a popover with a
    hidden input rather than a native field — it cannot be seeded by
    `defaultValue` alone. Everything else on this form is an uncontrolled input
    that re-seeds from `state.values` through the `key` below.
  */
  const [measuredOn, setMeasuredOn] = useState<IsoDate>(
    measurement?.measuredOn ?? report?.parsed.measuredOn ?? (today as IsoDate),
  );

  /*
    The PDF has to reach the save action, and a `<input type="file">` cannot be
    given a value programmatically. A `DataTransfer` is the one way to put a File
    the user already chose back into an input — the file came from them in the
    first place, so nothing is being smuggled; it is being carried from step one
    to step two of the same submission.
  */
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!report || !fileInput.current) return;

    const carrier = new DataTransfer();
    carrier.items.add(report.file);
    fileInput.current.files = carrier.files;
  }, [report]);

  useEffect(() => {
    if (state.status === 'success') onSaved(state);
  }, [state, onSaved]);

  /**
   * The server's complaint, translated.
   *
   * `measurementSchema` reports **keys** rather than sentences, the same
   * arrangement `clientFormSchema` documents: this app is read in Arabic and
   * Zod's own defaults are English prose. Anything not in the catalogue is
   * dropped rather than rendered, because an unrecognised key can only come
   * from a payload this form did not produce.
   */
  const errorFor = (field: string) => {
    const key = state.status === 'error' ? state.fieldErrors?.[field]?.[0] : undefined;
    if (key === undefined || !isMessageKey(key)) return undefined;

    return t(`validation.${key}`, VALIDATION_VALUES);
  };

  /**
   * What the box opens with.
   *
   * A refusal wins over everything — that is what was just typed and is being
   * corrected. Then the stored measurement when editing, then the report when
   * one filled this form, and otherwise empty.
   *
   * ⚠ A figure the report did not carry stays **empty**, never `0`. That is the
   * form half of the rule the column states: an empty box is saved as "not
   * measured", and a machine that reported no body fat is not the same fact as a
   * client who has none.
   */
  const seed = (field: string): string => {
    if (state.status === 'error' && state.values) return state.values[field] ?? '';

    const stored = measurement?.[field];
    if (stored !== null && stored !== undefined) return String(stored);

    const figure = report?.parsed.figures[field as keyof ParsedReport['figures']];
    return figure?.value === null || figure?.value === undefined ? '' : String(figure.value);
  };

  /** Where a pre-filled figure came from, shown under the box. */
  const provenance = (field: string): string | null => {
    const figure = report?.parsed.figures[field as keyof ParsedReport['figures']];
    if (!figure || figure.value === null) return null;
    return figure.raw;
  };

  const clock = (minute: number) => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
  };

  // Keyed on the refusal count so every uncontrolled field remounts and
  // re-seeds — see the long note in `client-form.tsx` on why this is a counter
  // and not the values themselves.
  const seedKey = state.status === 'error' ? state.attempt : 0;

  return (
    /*
      `noValidate` for the reason `ClientForm` states: the schema is the only
      validator, so every field has to fail the same way and in the same place.
      A browser bubble on some fields and a red edge with a sentence on others,
      for one press of Save, is what this avoids.
    */
    <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col text-start">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      {measurement ? <input type="hidden" name="measurementId" value={measurement.id} /> : null}

      {/*
        Where the report travels back to the save. `source` is *not* among these
        — the action decides it from whether a file actually arrived, so a posted
        field cannot claim a hand-typed measurement came off a machine.
      */}
      {report ? (
        <>
          <input type="hidden" name="deviceLabel" value={report.parsed.device ?? ''} />
          <input type="hidden" name="deviceSubjectId" value={report.parsed.subjectId ?? ''} />
          <input type="hidden" name="parserVersion" value={report.parsed.parserVersion ?? ''} />
          <input type="hidden" name="rawValues" value={JSON.stringify(report.parsed.rawValues)} />
          <input ref={fileInput} type="file" name="report" className="sr-only" tabIndex={-1} />
        </>
      ) : null}

      <DialogBody className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        {report ? (
          <div className="space-y-3">
            <ReportSummary
              device={report.parsed.device}
              fileName={report.fileName}
              found={report.found}
              total={report.total}
              onReplace={report.onReplace}
            />
            <ReportWarnings warnings={report.warnings} />
          </div>
        ) : null}

        <FieldHint>{report ? t('upload.checkHint') : t('form.hint')}</FieldHint>

        {/* ── When ─────────────────────────────────────────────────── */}
        <fieldset className="space-y-3">
          <legend className="text-caption font-semibold text-muted-foreground uppercase">
            {t('form.when')}
          </legend>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <Label htmlFor="measuredOn">{t('form.measuredOn')}</Label>
              <DatePicker
                id="measuredOn"
                name="measuredOn"
                value={measuredOn}
                onChange={setMeasuredOn}
                locale={locale}
                max={today}
                aria-invalid={Boolean(errorFor('measuredOn'))}
              />
              <FieldError>{errorFor('measuredOn')}</FieldError>
            </Field>

            <Field>
              <Label htmlFor="measuredAtMinute">{t('form.measuredAtMinute')}</Label>
              <TimeInput
                key={seedKey}
                id="measuredAtMinute"
                name="measuredAtMinute"
                defaultValue={
                  state.status === 'error' && state.values
                    ? (state.values.measuredAtMinute ?? '')
                    : measurement
                      ? clock(measurement.measuredAtMinute)
                      : ''
                }
                aria-invalid={Boolean(errorFor('measuredAtMinute'))}
              />
              <FieldError>{errorFor('measuredAtMinute')}</FieldError>
            </Field>
          </div>
        </fieldset>

        {/* ── The figures ──────────────────────────────────────────── */}
        {GROUPS.map((group) => (
          <fieldset key={group.key} className="space-y-3">
            <legend className="text-caption font-semibold text-muted-foreground uppercase">
              {t(`form.${group.key}`)}
            </legend>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((field) => {
                const error = errorFor(field.name);

                return (
                  <Field key={field.name}>
                    <Label htmlFor={field.name}>
                      {t(`metrics.${field.name}`)}
                      {'required' in field && field.required ? (
                        <span aria-hidden="true" className="ms-1 text-destructive">
                          *
                        </span>
                      ) : null}
                    </Label>

                    <InputGroup>
                      <InputGroupInput
                        key={seedKey}
                        id={field.name}
                        name={field.name}
                        /*
                          `inputMode="decimal"` and `type="text"`, not
                          `type="number"`: a number input silently discards a
                          value the browser considers malformed, so a mistyped
                          figure comes back as an empty box with no explanation
                          — and this form's whole contract is that an empty box
                          means "not measured". A text input hands the string to
                          the schema, which says what is wrong with it.
                        */
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        dir="ltr"
                        className="tabular-nums"
                        defaultValue={seed(field.name)}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? `${field.name}-error` : undefined}
                        required={'required' in field && field.required}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>{t(`units.${field.unit}`)}</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>

                    <FieldError id={`${field.name}-error`}>{error}</FieldError>

                    {/*
                      What the sheet actually printed, under the box it filled.
                      The figures are located by position rather than by label
                      (the labels on these sheets are images), so showing the
                      reader the source text is how "check what we read" becomes
                      something a person can actually do.
                    */}
                    {!error && provenance(field.name) ? (
                      <FieldHint className="tabular-nums">{provenance(field.name)}</FieldHint>
                    ) : null}
                  </Field>
                );
              })}
            </div>
          </fieldset>
        ))}

        {/* ── Note ─────────────────────────────────────────────────── */}
        <Field>
          <Label htmlFor="note">{t('form.note')}</Label>
          <Textarea
            key={seedKey}
            id="note"
            name="note"
            rows={2}
            placeholder={t('form.notePlaceholder')}
            defaultValue={seed('note')}
          />
        </Field>

        {/* ── The one decision that reaches outside this feature ────── */}
        <label
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-lg border border-border',
            'bg-secondary/50 p-4',
          )}
        >
          <input
            type="checkbox"
            name="applyToCurrentWeight"
            defaultChecked={!measurement}
            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
          />
          <span className="space-y-1">
            <span className="block text-body font-medium">{t('form.applyToCurrentWeight')}</span>
            <span className="block text-caption text-muted-foreground">
              {t('form.applyHint')}{' '}
              {currentWeightKg === null
                ? t('form.applyHintUnset')
                : t('form.applyHintCurrent', { weight: currentWeightKg.toFixed(1) })}
            </span>
          </span>
        </label>

        <FormMessage state={state} />
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {tCommon('cancel')}
        </Button>
        <SubmitButton label={t('save')} />
      </DialogFooter>
    </form>
  );
}

/**
 * The whole-form complaint.
 *
 * `errors.invalid` is suppressed because the fields are already saying it, one
 * by one — restating "some figures need checking" above fourteen inputs that
 * each carry their own message adds noise, not information. The other three
 * (a duplicate, a vanished row, an unexpected failure) have no field to attach
 * to and appear here.
 */
function FormMessage({ state }: { state: MeasurementFormState }) {
  const t = useTranslations('measurements');
  if (state.status !== 'error' || state.messageKey === 'errors.invalid') return null;

  return (
    <p role="status" className="text-body text-destructive">
      {t(state.messageKey)}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
