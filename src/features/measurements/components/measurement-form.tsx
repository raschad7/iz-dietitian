'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Icon, type IconName } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/number-field';
import { Textarea } from '@/components/ui/textarea';
import { HEIGHT_CM_RANGE, WEIGHT_KG_RANGE } from '@/features/clients/form-rules';
import { type Locale } from '@/i18n/routing';
import { type IsoDate } from '@/lib/iso-date';

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
 * ## The boxes are the system's boxes
 *
 * Every figure is a shared `NumberField`: 48px, the 10px control radius, the
 * neutral focus edge. This form used to compose a bare `InputGroup` — the
 * upstream shadcn component, 32px with `rounded-lg` and the brand focus ring —
 * with the unit sitting inside the box as an addon. Next to the intake dialog
 * two clicks away it read as a different application, which is what a shared
 * primitive exists to prevent. The unit moved into the label for the reason
 * that component records, and took a real bug with it: `totalBodyWaterKg` and
 * `totalBodyWaterPercent` are both called "body water", so the form was drawing
 * the same label over two different boxes.
 *
 * ## There is no time field
 *
 * The column is still there and a report still files its own clock into it —
 * that is free provenance and the duplicate check reads it. But a dietitian
 * recording a visit does not know or care what minute the client stood on the
 * scale, and asking for one put an empty box beside the date on every single
 * entry. The date is the fact; the minute is the machine's footnote.
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

/**
 * The figures, grouped the way the report itself is laid out.
 *
 * One glyph per group and none on the fields themselves. Fourteen icons down a
 * form is decoration; four beside four headings is a way to find the group you
 * want without reading all four. The four are distinct on purpose — see the
 * design system on two rows of one screen never sharing a picture.
 */
const GROUPS = [
  {
    key: 'core',
    icon: 'weightOutline',
    fields: [
      { name: 'weightKg', unit: 'kg', required: true },
      { name: 'heightCm', unit: 'cm' },
    ],
  },
  {
    key: 'composition',
    icon: 'personOutline',
    fields: [
      { name: 'bodyFatPercent', unit: 'percent' },
      { name: 'fatMassKg', unit: 'kg' },
      { name: 'muscleMassKg', unit: 'kg' },
      { name: 'fatFreeMassKg', unit: 'kg' },
      { name: 'boneMassKg', unit: 'kg' },
      { name: 'totalBodyWaterKg', unit: 'kg' },
      { name: 'totalBodyWaterPercent', unit: 'percent' },
    ],
  },
  {
    key: 'metabolism',
    icon: 'calories',
    fields: [
      { name: 'basalMetabolicRateKcal', unit: 'kcal' },
      { name: 'visceralFatRating', unit: 'rating' },
      { name: 'metabolicAge', unit: 'years' },
    ],
  },
  {
    key: 'girth',
    icon: 'heightOutline',
    fields: [
      { name: 'waistCm', unit: 'cm' },
      { name: 'hipCm', unit: 'cm' },
    ],
  },
  /*
    `as const satisfies` and not a type annotation. The literal keys are what
    next-intl checks `t('metrics.weightKg')` against — annotating this array
    with `{ name: string }` widens them to `string`, and every lookup on this
    form becomes an untyped `metrics.${string}` the message catalogue refuses.
  */
] as const satisfies readonly {
  key: string;
  icon: IconName;
  fields: readonly { name: string; unit: string; required?: boolean }[];
}[];

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
  /**
   * When this client's existing readings were taken — every one of them.
   *
   * ⚠ **So a collision is caught before Save, not after it.** The unique index
   * on `(client, date, minute)` used to be the only thing that knew: you picked
   * a day, filled fourteen boxes, pressed Save, waited for a round trip and got
   * a red block at the foot of the dialog. The panel holds every measurement —
   * the answer was three feet up the tree the whole time.
   *
   * **Minute, not just date**, because that is what the index actually says and
   * a form that refuses more than the database does is its own bug. A day can
   * legitimately hold two rows: the intake weight files a hand-typed row at
   * midnight, and the machine's own sheet comes in at the clock it printed. That
   * is the ordinary shape of a first visit, and blocking it would have broken
   * the flow it belongs to.
   *
   * The id is here so the row being corrected is not a collision with itself —
   * the same `excludeMeasurementId` `measurementExistsAt` takes on the server.
   */
  takenSlots: readonly { id: string; measuredOn: IsoDate; measuredAtMinute: number }[];
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
  takenSlots,
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

  /*
    The minute the reading was taken at, carried rather than asked for.

    An edited row keeps its own; a report keeps the clock printed on it; a
    reading typed in by hand is filed at midnight, which is what "no time was
    recorded" looks like in a column that cannot be null. The unique index is
    `(client, date, minute)`, so a hand-typed entry and a machine reading on the
    same day still sit apart.
  */
  const measuredAtMinute =
    measurement?.measuredAtMinute ?? report?.parsed.measuredAtMinute ?? 0;

  /*
    The height disagreement, if the upload found one. `RecordWarning` is the
    only warning kind this form turns into a control rather than a sentence —
    see the checkbox below for why this one earns it.
  */
  const heightMismatch = report?.warnings.find(
    (warning): warning is Extract<RecordWarning, { kind: 'heightMismatch' }> =>
      'kind' in warning && warning.kind === 'heightMismatch',
  );

  /*
    The collision, said before Save rather than after it.

    Exactly the question `measurementExistsAt` asks on the server — same date,
    same minute, ignoring the row being corrected — reached without a round trip
    from a list the panel already had. A dietitian who opens this dialog on a
    slot they have already recorded finds out while the date is still the thing
    they are looking at, instead of after filling the form.

    The refused-by-the-server message wins when there is one: it is about the
    submission that was actually attempted, and this is about what is in the box
    right now.
  */
  const dateTaken = takenSlots.some(
    (slot) =>
      slot.measuredOn === measuredOn &&
      slot.measuredAtMinute === measuredAtMinute &&
      slot.id !== measurement?.id,
  );
  const dateError = errorFor('measuredOn') ?? (dateTaken ? t('validation.dateTaken') : undefined);

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
      <input type="hidden" name="measuredAtMinute" value={measuredAtMinute} />
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

      <DialogBody className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-5">
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

        {/*
          The upload's own instruction, and only that.

          There used to be a second paragraph above it on every open — "weight
          is the only required field, leave a box empty if the machine did not
          report it" — which is a rule about the form rather than anything to do
          with the visit being recorded. It was true, it was long, and it was in
          the way of the first field on a dialog somebody opens several times a
          day. The asterisk on الوزن says the same thing in one character, and
          an empty box saving as "not measured" is the behaviour a dietitian
          learns once.
        */}
        {report ? <Callout tone="neutral">{t('upload.checkHint')}</Callout> : null}

        {/* ── When ─────────────────────────────────────────────────── */}
        <FormSection icon="calendar" title={t('form.when')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field>
              <Label htmlFor="measuredOn" required>
                {t('form.measuredOn')}
              </Label>
              <DatePicker
                id="measuredOn"
                name="measuredOn"
                value={measuredOn}
                onChange={setMeasuredOn}
                locale={locale}
                max={today}
                aria-invalid={Boolean(dateError)}
              />
              <FieldError>{dateError}</FieldError>
            </Field>
          </div>
        </FormSection>

        {/* ── The figures ──────────────────────────────────────────── */}
        {GROUPS.map((group) => (
          <FormSection key={group.key} icon={group.icon} title={t(`form.${group.key}`)}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((field) => (
                <NumberField
                  key={field.name}
                  name={field.name}
                  label={t(`metrics.${field.name}`)}
                  unit={t(`units.${field.unit}`)}
                  /*
                    Text, not a number input: see the note on `NumberField`'s
                    `mode`. This form's whole contract is that an empty box
                    means "not measured", so a value the browser would silently
                    discard has to reach the schema instead.
                  */
                  mode="text"
                  required={'required' in field && field.required}
                  inputKey={seedKey}
                  defaultValue={seed(field.name)}
                  error={errorFor(field.name)}
                  /*
                    What the sheet actually printed, under the box it filled.
                    The figures are located by position rather than by label
                    (the labels on these sheets are images), so showing the
                    reader the source text is how "check what we read" becomes
                    something a person can actually do.
                  */
                  hint={provenance(field.name) ?? undefined}
                />
              ))}
            </div>
          </FormSection>
        ))}

        {/* ── Note ─────────────────────────────────────────────────── */}
        <FormSection icon="notes" title={t('form.note')}>
          <Field>
            <Label htmlFor="note" className="sr-only">
              {t('form.note')}
            </Label>
            <Textarea
              key={seedKey}
              id="note"
              name="note"
              rows={2}
              placeholder={t('form.notePlaceholder')}
              defaultValue={seed('note')}
            />
          </Field>
        </FormSection>

        {/* ── The decisions that reach outside this feature ─────────── */}
        <div className="space-y-3">
          <DecisionCheckbox
            name="applyToCurrentWeight"
            defaultChecked={!measurement}
            label={t('form.applyToCurrentWeight')}
            hint={`${t('form.applyHint')} ${
              currentWeightKg === null
                ? t('form.applyHintUnset')
                : t('form.applyHintCurrent', { weight: currentWeightKg.toFixed(1) })
            }`}
          />

          {/*
            Offered only when the upload found the two heights disagreeing.

            The warning above already says so; this is the control that settles
            it. One of the two numbers is wrong and the moment somebody has both
            in front of them is the moment to fix it — sending them to another
            tab to retype a height they can already see is how a warning becomes
            something people learn to scroll past.

            **Ticked by default, like the weight box.** The report is the
            measurement of record: the figures on it were taken today, on
            calibrated equipment, and the height beside them is the one the
            machine's own BMI and body-fat estimates were computed from. A
            record disagreeing with it is a record holding a stale or mistyped
            number. Untick it when the machine is the one that is wrong — the
            box in the form above still carries whichever height is about to be
            written.
          */}
          {heightMismatch ? (
            <DecisionCheckbox
              name="applyHeightToClient"
              defaultChecked
              label={t('form.applyHeightToClient', { height: heightMismatch.onReport })}
              hint={t('form.applyHeightHint', {
                current: heightMismatch.onRecord,
                height: heightMismatch.onReport,
              })}
            />
          ) : null}
        </div>

        <FormMessage state={state} />
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {tCommon('cancel')}
        </Button>
        {/*
          Blocked while the date is one that already has a reading. A press that
          can only come back refused is worse than a control that says it will
          not go: the refusal costs a round trip and arrives somewhere else on
          the screen, and this dialog has already had one bug where Save
          appeared to do nothing at all. The reason is under the date box, which
          is also where the fix is.
        */}
        <SubmitButton label={t('save')} disabled={dateTaken} />
      </DialogFooter>
    </form>
  );
}

/**
 * A decision that changes something outside this measurement.
 *
 * Both of them are checkboxes rather than automatic writes, and for the same
 * reason: each moves a figure another screen is computing from — the calorie
 * target, the BMI on two tabs — so a dietitian should be able to see
 * themselves doing it. The shared `Checkbox` renders its native input inside,
 * so this posts `name=on` and still works wrapped in a label.
 */
function DecisionCheckbox({
  name,
  defaultChecked,
  label,
  hint,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary/50 p-4">
      <Checkbox name={name} defaultChecked={defaultChecked} className="mt-0.5" />
      <span className="space-y-1">
        <span className="block text-body-md font-medium">{label}</span>
        <span className="block text-caption text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/**
 * One titled group of fields.
 *
 * `fieldset`/`legend`, because these really are groups of controls and saying
 * so is free. The heading is `text-label` — the system's 13px/600 "labels and
 * compact state text" — and **not uppercased**: the design system forbids an
 * uppercase transform on Arabic, where it does nothing to the letterforms and
 * only widens the tracking of a script that has no case at all.
 */
function FormSection({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 flex items-center gap-2 text-label font-semibold text-muted-foreground">
        <Icon name={icon} className="size-4 shrink-0" />
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * Every field this form actually draws a box for.
 *
 * The schema has more fields than the screen does — `clientId`, `locale`,
 * `measuredAtMinute`, the report's origin — and they arrive in hidden inputs.
 * This is the set a refusal can be *shown* against.
 */
const VISIBLE_FIELDS = new Set<string>([
  'measuredOn',
  'note',
  ...GROUPS.flatMap((group) => group.fields.map((field) => field.name)),
]);

/**
 * The whole-form complaint.
 *
 * `errors.invalid` is normally suppressed because the fields are already saying
 * it, one by one — restating "some figures need checking" above fourteen inputs
 * that each carry their own message adds noise, not information. The other two
 * (a vanished row, an unexpected failure) have no field to attach to and appear
 * here.
 *
 * A same-day collision used to be a third. It is `validation.dateTaken` on
 * `measuredOn` now, so it renders under the date box like every other complaint
 * about the date — see `MeasurementFormState`.
 *
 * ⚠ **Unless the refusal names a field this form does not draw.** That
 * suppression assumed every field error lands beside a visible box, and the day
 * the time input was removed the assumption stopped being true: the hidden
 * `measuredAtMinute` started failing validation, its message had nowhere to
 * render, and pressing Save did *nothing at all* — no error, no row, no clue.
 * A form that cannot show you why it refused you has to say so out loud, so an
 * error on an invisible field is printed here with the field's own message.
 * This is a backstop for a bug, not a feature: if a reader ever sees one, the
 * fix is in the code that posts that field.
 */
function FormMessage({ state }: { state: MeasurementFormState }) {
  const t = useTranslations('measurements');
  if (state.status !== 'error') return null;

  const hidden =
    state.fieldErrors === undefined
      ? []
      : Object.entries(state.fieldErrors).filter(
          ([field, messages]) =>
            !VISIBLE_FIELDS.has(field) && messages !== undefined && messages.length > 0,
        );

  if (hidden.length > 0) {
    return (
      <Callout tone="medical">
        {hidden
          .map(([, messages]) => {
            const key = messages![0]!;
            return isMessageKey(key) ? t(`validation.${key}`, VALIDATION_VALUES) : key;
          })
          .join(' ')}
      </Callout>
    );
  }

  if (state.messageKey === 'errors.invalid') return null;

  return <Callout tone="medical">{t(state.messageKey)}</Callout>;
}

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending || disabled}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
