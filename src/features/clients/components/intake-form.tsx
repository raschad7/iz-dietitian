'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Icon, type IconName } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { TimeInput } from '@/components/ui/time-input';
import { saveIntakeAction } from '@/features/clients/actions';
import { calculateAge } from '@/features/clients/age';
import { initialIntakeFormState, type IntakeFormState } from '@/features/clients/form-state';
import { mergedNotes } from '@/features/clients/notes';
import { ALLERGENS } from '@/features/clients/nutrition';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import {
  FIELDS_BY_SECTION,
  INTAKE_SECTIONS,
  type IntakeSectionId,
} from '@/features/clients/intake-sections';
import { type ClientIntakeValues, type MealSlotValues } from '@/features/clients/types';
import { suggestProteinGrams, suggestTargets } from '@/features/weekly-plans/targets';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The intake — everything clinical about one client, in the surface this app
 * writes client records on.
 *
 * **One form over two tables.** `clients` holds height, goal, activity level and
 * the clinical prose; `client_nutrition_profiles` holds weight, the allergen
 * tags, the targets and the schedule. That storage split is fine and stays —
 * what was wrong was making a dietitian navigate it. `saveIntake` fans one
 * submission back out.
 *
 * **A rail, not one scroll and not a wizard.** Five sections and two dozen
 * fields in a single column put the Save button two thousand pixels from the
 * first field, and a dietitian recording one weigh-in scrolled past allergens,
 * medications and the meal schedule to reach it. A wizard would be worse: this
 * form is edited far more often than it is created, and steps punish the person
 * who came to change one number. The rail shows all five at once, marks which
 * ones have content, and reaches any of them in a click — so the structure is
 * also the progress indicator.
 *
 * Nothing here is required except the schedule. An intake is filled in over
 * several visits, and a form that refuses to save until it is complete is a form
 * that loses the half someone had already typed.
 */

/**
 * The sections, in the order a client is actually worked through.
 *
 * There was a sixth, `portal` — a share-the-weight switch and a note written for
 * the client to read. Both are gone, along with everything downstream that
 * displayed them; the columns are still in the database and are simply no longer
 * read or written, so nothing already recorded was destroyed to remove a screen.
 */
const SECTIONS = INTAKE_SECTIONS;

type SectionId = IntakeSectionId;

/** The icon that stands for each section in the rail. */
const SECTION_ICONS = {
  measurements: 'progress',
  allergies: 'medical',
  clinical: 'notes',
  planning: 'weeklyPlans',
  schedule: 'clock',
} as const satisfies Record<SectionId, string>;

export function IntakeForm({
  intake,
  locale,
  section: initialSection = 'measurements',
  onCancel,
  onSaved,
}: {
  intake: ClientIntakeValues;
  locale: Locale;
  /**
   * Which panel the dialog opens on. The gap chips on the Nutrition tab pass
   * the section that holds the field they name, so a chip reading "الحساسية"
   * lands on الحساسية والحالة الصحية rather than on القياسات.
   */
  section?: SectionId;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');

  const [state, formAction] = useActionState(saveIntakeAction, initialIntakeFormState);
  /*
   * The opening panel is an initial value, not a controlled one: the dialog is
   * mounted fresh each time it opens, and after that the rail owns which
   * section is showing. Syncing it to the prop would yank someone back to where
   * they came in from on an unrelated re-render.
   */
  const [section, setSection] = useState<SectionId>(initialSection);

  /*
   * The four values the readout is computed from are controlled; everything else
   * on this form is not.
   *
   * That asymmetry is the point of the screen. The daily target is what gates
   * generation, and until now it could only be discovered by saving, leaving,
   * and reading a panel in another feature — which is how a client ended up with
   * a height on one form and a weight on another and nobody noticing.
   */
  const [heightCm, setHeightCm] = useState(intake.heightCm?.toString() ?? '');
  const [weightKg, setWeightKg] = useState(intake.weightKg?.toString() ?? '');
  const [goal, setGoal] = useState(intake.goal ?? '');
  const [activityLevel, setActivityLevel] = useState(intake.activityLevel ?? '');

  const [slots, setSlots] = useState<MealSlotValues[]>(intake.mealSchedule);
  const [custom, setCustom] = useState<string[]>(intake.customAllergens);

  const errorFor = (field: string) =>
    state.status === 'error' ? state.fieldErrors?.[field]?.[0] : undefined;

  useEffect(() => {
    if (state.status === 'success') onSaved();
  }, [state.status, onSaved]);

  /*
   * `dateOfBirth` and `sex` are read here and written on the client card. They
   * are demographics rather than clinical measurements, they do not change, and
   * Mifflin-St Jeor is unanswerable without them — so the readout names them
   * when they are absent rather than silently reporting nothing.
   */
  const age = intake.dateOfBirth ? calculateAge(intake.dateOfBirth) : null;
  const targets = suggestTargets({
    weightKg: toNumberOrNull(weightKg),
    heightCm: toNumberOrNull(heightCm),
    age,
    sex: intake.sex,
    activityLevel: activityLevel || null,
    goal: goal || null,
  });

  const suggestedProtein = suggestProteinGrams(toNumberOrNull(weightKg));
  const panelId = useId();

  /*
   * Which sections already hold something, for the rail's dots.
   *
   * Computed from the loaded record rather than from live field state: the point
   * is "is there anything here", which a half-typed value does not change, and
   * recomputing on every keystroke would make the dots flicker while someone is
   * mid-word. Measurements is the exception — it is the section the readout
   * depends on, so it tracks the controlled values.
   */
  const filled: Record<SectionId, boolean> = {
    measurements: Boolean(heightCm || weightKg || goal || activityLevel),
    allergies:
      intake.allergenTags.length > 0 || custom.length > 0 || Boolean(intake.allergies?.trim()),
    clinical: Boolean(
      intake.conditions?.trim() ||
        intake.medications?.trim() ||
        intake.medicalNotes?.trim() ||
        intake.notes?.trim(),
    ),
    planning: Boolean(
      intake.permanentInstructions?.trim() ||
        intake.preferences?.trim() ||
        intake.dislikes?.trim() ||
        intake.dailyKcalTarget !== null ||
        intake.proteinTargetGrams !== null,
    ),
    schedule: true,
  };

  /*
   * A rejected field in a section nobody is looking at is a form that refuses to
   * save for no stated reason, so a failed submit switches to the first section
   * holding an error.
   *
   * Adjusted during render rather than in an effect. React supports a component
   * setting its own state while rendering — it re-runs the body immediately,
   * before touching the DOM — and that is the documented pattern for reacting
   * to a value changing. In an effect this would paint the wrong section first
   * and then correct it, which is a visible flash, and the compiler lint rejects
   * it outright.
   */
  const [seenState, setSeenState] = useState(state);

  if (state !== seenState) {
    setSeenState(state);

    if (state.status === 'error' && state.fieldErrors) {
      const broken = SECTIONS.find((id) =>
        FIELDS_BY_SECTION[id].some((field) => state.fieldErrors?.[field]?.length),
      );

      if (broken) setSection(broken);
    }
  }

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col text-start">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={intake.clientId} />

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <SectionRail
          current={section}
          filled={filled}
          onSelect={setSection}
          panelId={panelId}
        />

        {/*
          Every section stays mounted. A value typed into the schedule and then
          navigated away from has to still be there on save — this is one form
          with one submit, not five.
        */}
        <div
          id={panelId}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
        >
          <Panel id="measurements" current={section}>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                name="heightCm"
                label={t('fields.heightCm')}
                icon="heightOutline"
                placeholder={t('intake.placeholders.heightCm')}
                min={30}
                max={280}
                step={1}
                value={heightCm}
                onChange={setHeightCm}
                error={errorFor('heightCm')}
              />
              <NumberField
                name="weightKg"
                label={t('fields.weightKg')}
                icon="weightOutline"
                placeholder={t('intake.placeholders.weightKg')}
                min={20}
                max={400}
                step={0.5}
                value={weightKg}
                onChange={setWeightKg}
                error={errorFor('weightKg')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="goal">{t('fields.goal')}</Label>
                <SelectField
                  id="goal"
                  name="goal"
                  value={goal}
                  onValueChange={setGoal}
                  placeholder={t('notProvided')}
                  /*
                    "Not provided" is a row, not just placeholder text: intake is
                    a form someone can walk back, and a goal chosen by mistake
                    has to be un-choosable without reloading the page.
                  */
                  options={[
                    { value: '', label: t('notProvided') },
                    ...CLIENT_GOALS.map((value) => ({ value, label: t(`goal.${value}`) })),
                  ]}
                />
                <FieldError>{errorFor('goal')}</FieldError>
              </Field>

              <Field>
                <Label htmlFor="activityLevel">{t('fields.activityLevel')}</Label>
                <SelectField
                  id="activityLevel"
                  name="activityLevel"
                  value={activityLevel}
                  onValueChange={setActivityLevel}
                  placeholder={t('notProvided')}
                  options={[
                    { value: '', label: t('notProvided') },
                    ...CLIENT_ACTIVITY_LEVELS.map((value) => ({
                      value,
                      label: t(`activity.${value}`),
                    })),
                  ]}
                />
                <FieldError>{errorFor('activityLevel')}</FieldError>
              </Field>
            </div>

            <TargetReadout
              targets={targets}
              protein={suggestedProtein}
              overrideKcal={intake.dailyKcalTarget}
            />
          </Panel>

          <Panel id="allergies" current={section}>
            <AllergenField
              defaultTags={intake.allergenTags}
              custom={custom}
              onCustomChange={setCustom}
            />

            <Field>
              <Label htmlFor="allergies">{t('intake.allergyDetailLabel')}</Label>
              <Textarea
                id="allergies"
                name="allergies"
                rows={3}
                maxLength={1000}
                defaultValue={intake.allergies ?? ''}
                placeholder={t('intake.allergyDetailPlaceholder')}
              />
              <FieldError>{errorFor('allergies')}</FieldError>
            </Field>
          </Panel>

          <Panel id="clinical" current={section}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="conditions"
                label={t('fields.conditions')}
                placeholder={t('intake.placeholders.conditions')}
                rows={3}
                maxLength={1000}
                defaultValue={intake.conditions}
                error={errorFor('conditions')}
              />
              <TextField
                name="medications"
                label={t('fields.medications')}
                placeholder={t('intake.placeholders.medications')}
                rows={3}
                maxLength={1000}
                defaultValue={intake.medications}
                error={errorFor('medications')}
              />
            </div>

            {/*
              One note, not two.

              These were `medicalNotes` and `notes`: two textareas under one
              heading, both private to the clinic, both free prose, told apart
              only by their labels — "ملاحظات طبية" over "ملاحظات". Nothing said
              which one a note belonged in, so the answer was whichever the
              dietitian's eye landed on first, and reading a record meant
              reading both boxes to be sure.

              The heading names the group and the field is the group, so the
              divider goes with the second box: a labelled rule above a single
              field is a section of one. Text already in `notes` is merged into
              the value below — see `mergedNotes`.
            */}
            <TextField
              name="medicalNotes"
              label={t('intake.notesDivider')}
              placeholder={t('intake.placeholders.medicalNotes')}
              rows={5}
              maxLength={4000}
              defaultValue={mergedNotes(intake.medicalNotes, intake.notes)}
              error={errorFor('medicalNotes')}
            />
          </Panel>

          <Panel id="planning" current={section}>
            <TextField
              name="permanentInstructions"
              label={t('fields.permanentInstructions')}
              placeholder={t('intake.placeholders.permanentInstructions')}
              rows={3}
              maxLength={2000}
              defaultValue={intake.permanentInstructions}
              error={errorFor('permanentInstructions')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="preferences"
                label={t('fields.preferences')}
                placeholder={t('intake.placeholders.preferences')}
                rows={3}
                maxLength={1000}
                defaultValue={intake.preferences}
                error={errorFor('preferences')}
              />
              <TextField
                name="dislikes"
                label={t('fields.dislikes')}
                placeholder={t('intake.placeholders.dislikes')}
                rows={3}
                maxLength={1000}
                defaultValue={intake.dislikes}
                error={errorFor('dislikes')}
              />
            </div>

            <Divider label={t('intake.overrideDivider')} />

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                name="dailyKcalTarget"
                label={t('fields.dailyKcalTarget')}
                icon="calories"
                min={800}
                max={6000}
                step={50}
                // Placeholder, never prefilled: an empty field means "keep using
                // the formula", and prefilling would silently freeze today's
                // number into a permanent override.
                placeholder={targets.suggestedKcal?.toString() ?? ''}
                defaultValue={intake.dailyKcalTarget?.toString() ?? ''}
                error={errorFor('dailyKcalTarget')}
              />
              <NumberField
                name="proteinTargetGrams"
                label={t('fields.proteinTargetGrams')}
                icon="protein"
                min={20}
                max={400}
                step={5}
                placeholder={suggestedProtein?.toString() ?? ''}
                defaultValue={intake.proteinTargetGrams?.toString() ?? ''}
                error={errorFor('proteinTargetGrams')}
              />
            </div>
          </Panel>

          <Panel id="schedule" current={section}>
            <MealScheduleField
              slots={slots}
              onChange={setSlots}
              error={errorFor('mealSchedule')}
            />
          </Panel>
        </div>
      </div>

      <DialogFooter className="gap-3">
        <FormMessage state={state} />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {tCommon('cancel')}
        </Button>
        <SubmitButton />
      </DialogFooter>
    </form>
  );
}

/** `''` from an untouched number input is "not provided", not zero. */
function toNumberOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The five sections, always all visible, with a dot for the ones that hold
 * something.
 *
 * A `tablist` and not a nav: these are panels of one form, not destinations, and
 * the arrow-key behaviour a tablist promises is the behaviour a reader wants
 * here. Horizontal and scrollable on a phone, a real column from `sm` up — the
 * Arabic labels do not fit across a 375px screen, and truncating them would hide
 * the sections people forget exist.
 */
function SectionRail({
  current,
  filled,
  onSelect,
  panelId,
}: {
  current: SectionId;
  filled: Record<SectionId, boolean>;
  onSelect: (id: SectionId) => void;
  panelId: string;
}) {
  const t = useTranslations('clients');
  const tabs = useRef<HTMLDivElement>(null);

  /* Arrow keys move between tabs, which is what `role="tablist"` promises. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const back = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
    if (!forward && !back) return;

    event.preventDefault();

    const index = SECTIONS.indexOf(current);
    // `ArrowRight` means "the next one" in Arabic too: the visual direction is
    // the document's, and stepping through the array is what both scripts read
    // as forward.
    const next = SECTIONS[(index + (forward ? 1 : SECTIONS.length - 1)) % SECTIONS.length];
    if (!next) return;

    onSelect(next);
    tabs.current?.querySelector<HTMLButtonElement>(`[data-section="${next}"]`)?.focus();
  };

  return (
    <div
      ref={tabs}
      role="tablist"
      aria-orientation="vertical"
      aria-label={t('intake.sectionsLabel')}
      onKeyDown={onKeyDown}
      className={cn(
        'flex shrink-0 gap-1 overflow-x-auto border-border p-2',
        'border-b sm:w-56 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-e sm:p-3',
      )}
    >
      {SECTIONS.map((id) => {
        const active = id === current;

        return (
          <button
            key={id}
            type="button"
            role="tab"
            data-section={id}
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(id)}
            className={cn(
              'flex h-10 shrink-0 items-center gap-2.5 rounded-[10px] px-3 text-body-sm whitespace-nowrap',
              'transition-colors duration-180 ease-out sm:h-11 sm:w-full',
              // The rail's active item is the one olive thing on it, matching
              // `Sidebar`: an olive-50 surface with an olive label.
              active
                ? 'bg-secondary font-semibold text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon name={SECTION_ICONS[id]} className="size-4 shrink-0" />
            <span className="truncate">{t(`intake.sections.${id}`)}</span>

            {/*
              A dot, not a tick. A tick claims the section is complete, and no
              section here is ever required to be — this only says there is
              something to read inside. Carries an `aria-label` because a 6px
              circle is meaning conveyed by shape alone.
            */}
            {filled[id] ? (
              <span
                className={cn(
                  'ms-auto size-1.5 shrink-0 rounded-full',
                  active ? 'bg-primary' : 'bg-border',
                )}
                role="img"
                aria-label={t('intake.hasContent')}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One section's fields.
 *
 * `hidden` rather than unmounted: this is one form with one submit, so a value
 * typed in the schedule and then navigated away from has to still be in the
 * DOM when Save is pressed. `hidden` also keeps it out of the tab order without
 * `inert`, which would be wrong on a panel that is merely not current.
 */
function Panel({
  id,
  current,
  children,
}: {
  id: SectionId;
  current: SectionId;
  children: React.ReactNode;
}) {
  const t = useTranslations('clients');
  const active = id === current;

  return (
    <section
      role="tabpanel"
      aria-label={t(`intake.sections.${id}`)}
      hidden={!active}
      className={cn('flex-col gap-5', active ? 'flex' : 'hidden')}
    >
      {children}
    </section>
  );
}

/**
 * A labelled rule that names what the fields under it are for.
 *
 * Replaces the paragraph of hint text each of these groups used to carry. A
 * three-word label on a line does the same job as a sentence and does not have
 * to be read to be understood.
 */
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-label font-semibold text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * A number field as an `InputGroup`, with a glyph at its reading edge.
 *
 * **The unit is not in the box.** It used to sit at the far edge as a second
 * addon — `cm`, `kg`, `g`, `kcal` — which said twice what the label above
 * already says: every one of these fields is named "Height (cm)", "Weight
 * (kg)", "Protein (g)". A box holding a number and its own unit reads as a
 * composite control and invites the unit to be typed into it. The digits have
 * the box to themselves now.
 */
function NumberField({
  name,
  label,
  icon,
  min,
  max,
  step,
  value,
  onChange,
  defaultValue,
  placeholder,
  error,
}: {
  name: string;
  label: string;
  /**
   * A glyph at the group's inline-start, on the reading edge.
   *
   * Decorative: the `Label` above names the field, and a ruler announced
   * beside "Height" says it twice. It is there to tell four boxes of digits
   * apart at a glance in a panel where that is all they are.
   */
  icon?: IconName;
  min: number;
  max: number;
  step: number;
  value?: string;
  onChange?: (next: string) => void;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
}) {
  return (
    <Field>
      <Label htmlFor={name}>{label}</Label>
      {/*
        No direction lock on the group.

        It used to carry `dir="ltr"`, which laid the whole control out from the
        left in Arabic as well: the placeholder and the value started at the far
        edge from the one the form is read from, with the glyph beside them. The
        group follows the document instead, so in Arabic the icon, the
        placeholder and the digits all begin on the right, and in English the
        same arrangement mirrors back.

        Only the *box* mirrors. The digits inside it are a number, and a number
        is a left-to-right run under the bidi algorithm in either script — 171
        is written 171 in Arabic too — so the value still reads in the same
        order, it is simply aligned to the reading edge.

        `focusTone="neutral"`: the group draws its own focus treatment, and the
        brand default is the lime ring that `.q-field` deliberately refuses —
        a form is a column of fields and lime firing on each one as it is
        tabbed through turns the accent into noise.

        48px and the system's control radius, so the group matches the fields
        above and below it rather than the component's own 32px default.
      */}
      <InputGroup focusTone="neutral" className="h-12 rounded-(--radius-control)">
        {icon ? (
          <InputGroupAddon align="inline-start" className="ps-4">
            <Icon name={icon} />
          </InputGroupAddon>
        ) : null}

        <InputGroupInput
          id={name}
          name={name}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          className={cn(
            // The field's own inline padding, which `InputGroupInput` strips
            // back to nothing so a group can decide it per addon.
            'px-5',
            /*
              The browser's own spinners are drawn at the inline-end edge, and
              they appear on hover over a box whose whole content is a two- or
              three-digit number — a control nobody asked for, arriving on top
              of the value. Suppressed here rather than in `.q-field`, because
              the share column in the meal schedule is a number field that keeps
              them and loses nothing by it.
            */
            '[appearance:textfield]',
            '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          )}
          placeholder={placeholder}
          {...(onChange
            ? { value: value ?? '', onChange: (event) => onChange(event.target.value) }
            : { defaultValue })}
        />
      </InputGroup>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/**
 * A labelled textarea.
 *
 * The placeholder is an example of the kind of thing that belongs in the box,
 * not a restatement of the label above it: "Notes" over an empty field says
 * what the box is called and nothing about what a useful note looks like, and
 * these are the boxes a record is actually read from later.
 *
 * It carries no direction of its own, so it starts at the reading edge in both
 * scripts — right in Arabic, left in English — the way the prose typed into it
 * will.
 */
function TextField({
  name,
  label,
  rows,
  maxLength,
  defaultValue,
  placeholder,
  error,
}: {
  name: string;
  label: string;
  rows: number;
  maxLength: number;
  defaultValue: string | null;
  placeholder?: string;
  error?: string;
}) {
  return (
    <Field>
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ''}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/**
 * The daily target, BMI and protein figure, recomputed as the fields above
 * change — and the list of what is still missing when they cannot be.
 *
 * `targets.missing` names the fields rather than saying "incomplete", because
 * "fill in the weight" is actionable and "cannot compute a target" is not. Two
 * of the four it can name — date of birth and sex — belong to the client card
 * rather than to this dialog, which is why the message says where they are.
 */
function TargetReadout({
  targets,
  protein,
  overrideKcal,
}: {
  targets: ReturnType<typeof suggestTargets>;
  protein: number | null;
  overrideKcal: number | null;
}) {
  const t = useTranslations('clients');

  if (targets.missing.length > 0) {
    return (
      <p
        role="status"
        className="rounded-lg bg-status-attention-bg px-4 py-3 text-body-sm leading-relaxed text-status-attention-fg"
      >
        {t('intake.missingFields', {
          fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
        })}
      </p>
    );
  }

  return (
    <div role="status" className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border rtl:divide-x-reverse">
      <Stat
        label={t('intake.dailyTarget')}
        value={t('intake.kcalValue', { value: overrideKcal ?? targets.suggestedKcal ?? 0 })}
        note={overrideKcal === null ? t('intake.fromFormula') : t('intake.override')}
      />
      <Stat
        label={t('intake.bmi')}
        value={targets.bmi === null ? '—' : targets.bmi.toFixed(1)}
        note={targets.bmiCategory ? t(`bmiCategories.${targets.bmiCategory}`) : undefined}
      />
      <Stat
        label={t('fields.proteinTargetGrams')}
        value={protein === null ? '—' : t('intake.gramsValue', { value: protein })}
        note={t('intake.suggested')}
      />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-caption text-muted-foreground">{label}</span>
      <strong className="font-heading text-heading-sm font-semibold tabular-nums" dir="ltr">
        {value}
      </strong>
      {note ? <span className="text-caption text-muted-foreground">{note}</span> : null}
    </div>
  );
}

/**
 * The allergen ticks — the only thing that filters the dish catalog.
 *
 * Pills with a real `<input type="checkbox">` underneath, `sr-only`, with the
 * label styled by `:has()`. Same construction as `SexField` on the client card,
 * and for the same three reasons: the pair still submits with the rest of an
 * otherwise uncontrolled form, a screen reader gets a real checkbox group, and
 * the shape is the pill this system gives a chip.
 *
 * Ticked is clay rather than olive: this is the one control on the form whose
 * state is a medical flag, and olive here would read as "selected" rather than
 * "excluded".
 */
function AllergenField({
  defaultTags,
  custom,
  onCustomChange,
}: {
  defaultTags: string[];
  custom: string[];
  onCustomChange: (next: string[]) => void;
}) {
  const t = useTranslations('clients');
  const uid = useId();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const entry = useRef<HTMLInputElement>(null);

  const commit = () => {
    const value = draft.trim();

    // Silently ignored rather than rejected: a duplicate is a slip, and an
    // error message for one is more interruption than the mistake is worth.
    if (value && !custom.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      onCustomChange([...custom, value]);
    }

    setDraft('');
    setAdding(false);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-body-sm font-medium">{t('intake.allergenLegend')}</legend>

      <div className="flex flex-wrap gap-2">
        {ALLERGENS.map((allergen) => {
          const inputId = `${uid}-${allergen}`;

          return (
            <label
              key={allergen}
              htmlFor={inputId}
              className={cn(
                'flex h-10 cursor-pointer items-center rounded-full border border-input px-4',
                'text-body-sm font-medium text-foreground transition-colors duration-180 ease-out',
                'not-has-checked:hover:border-(--input-hover) not-has-checked:hover:bg-secondary',
                'has-checked:border-transparent has-checked:bg-status-medical-bg has-checked:font-semibold has-checked:text-status-medical-fg',
              )}
            >
              <input
                id={inputId}
                type="checkbox"
                name="allergenTags"
                value={allergen}
                defaultChecked={defaultTags.includes(allergen)}
                className="sr-only"
              />
              {t(`allergens.${allergen}`)}
            </label>
          );
        })}
      </div>

      <p className="text-caption text-muted-foreground">{t('intake.allergenHint')}</p>

      {/*
        Anything else the dietitian needs recorded — and it is drawn as a
        different kind of thing on purpose.

        The six above are the catalog filter: `dishes.allergen_tags` carries the
        same six values, and ticking one genuinely removes dishes. Nothing else
        can, because no dish is tagged with it. So these are outlined rather than
        filled, sit under their own heading, and say what they do. Drawing them
        identically would be the exact failure this whole screen was rebuilt to
        remove: an allergy that looks recorded and protects nobody.
      */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-body-sm font-medium">{t('intake.customAllergenLegend')}</p>

        <div className="flex flex-wrap items-center gap-2">
          {custom.map((allergen) => (
            <span
              key={allergen}
              className="flex h-10 items-center gap-1 rounded-full border border-dashed border-status-medical-fg/50 ps-4 pe-1 text-body-sm text-foreground"
            >
              <input type="hidden" name="customAllergens" value={allergen} />
              <span dir="auto">{allergen}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('intake.removeAllergen', { name: allergen })}
                onClick={() => onCustomChange(custom.filter((entryValue) => entryValue !== allergen))}
              >
                <Icon name="close" className="size-3.5" />
              </Button>
            </span>
          ))}

          {adding ? (
            <Input
              ref={entry}
              autoFocus
              value={draft}
              maxLength={40}
              aria-label={t('intake.customAllergenLegend')}
              placeholder={t('intake.customAllergenPlaceholder')}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  // This input lives inside the intake form; Enter must add a
                  // chip, not submit the whole intake.
                  event.preventDefault();
                  commit();
                  // Kept open so several can be typed in a row, which is how
                  // anyone entering more than one actually works.
                  setAdding(true);
                  requestAnimationFrame(() => entry.current?.focus());
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  setDraft('');
                  setAdding(false);
                }
              }}
              className="h-10 w-44"
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={custom.length >= 20}
              onClick={() => setAdding(true)}
            >
              <Icon name="add" />
              {t('intake.addAllergen')}
            </Button>
          )}
        </div>
      </div>
    </fieldset>
  );
}

/**
 * The client's eating schedule, as editable rows.
 *
 * Rows rather than a fixed five, because a client eating three times a day is
 * ordinary and a plan generated against five slots they do not use is
 * worthless. Submitted as parallel arrays — which is what an HTML form can
 * express — and zipped back together in the action.
 *
 * Shares are entered as whole percentages and divided by 100 on the server.
 */
function MealScheduleField({
  slots,
  onChange,
  error,
}: {
  slots: MealSlotValues[];
  onChange: (next: MealSlotValues[]) => void;
  error?: string;
}) {
  const t = useTranslations('clients');
  const shareTotal = slots.reduce((sum, slot) => sum + slot.kcalShare, 0);
  const percent = Math.round(shareTotal * 100);

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden gap-3 px-1 text-label font-semibold text-muted-foreground sm:grid sm:grid-cols-[1fr_13rem_7rem_auto]">
        <span>{t('fields.slotLabel')}</span>
        <span>{t('fields.slotTime')}</span>
        <span>{t('fields.slotShare')}</span>
        <span className="w-10" />
      </div>

      {slots.map((slot, index) => (
        <div
          key={slot.slotKey}
          className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-[1fr_13rem_7rem_auto] sm:items-center"
        >
          <input type="hidden" name="slotKey" value={slot.slotKey} />

          <Input
            name="slotLabel"
            required
            maxLength={60}
            defaultValue={slot.label}
            aria-label={t('fields.slotLabel')}
            className="col-span-2 sm:col-span-1"
          />
          {/*
            No `step`: `timeOfDaySchema` accepts any whole minute, so the
            control should too. A meal at 07:35 is a real answer.
          */}
          <TimeInput
            name="slotTime"
            defaultValue={slot.timeOfDay}
            aria-label={t('intake.time')}
          />
          <Input
            name="slotShare"
            type="number"
            min={0}
            max={100}
            dir="ltr"
            defaultValue={Math.round(slot.kcalShare * 100)}
            aria-label={t('fields.slotShare')}
          />

          <Button
            type="button"
            size="icon-sm"
            variant="destructiveGhost"
            // One slot is the minimum: a schedule of none cannot be planned
            // against, and the schema would reject it anyway.
            disabled={slots.length <= 1}
            aria-label={t('intake.removeSlotOf', { label: slot.label })}
            onClick={() => onChange(slots.filter((_, position) => position !== index))}
          >
            <Icon name="trash" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={slots.length >= 8}
          onClick={() =>
            onChange([
              ...slots,
              {
                // Suffixed by position so the key is unique and stable; the
                // schema rejects duplicates, and a collision would silently
                // drop a slot.
                slotKey: `snack_${slots.length + 1}`,
                label: '',
                timeOfDay: '16:00',
                kcalShare: 0.1,
              },
            ])
          }
        >
          <Icon name="add" />
          {t('intake.addSlot')}
        </Button>

        {/*
          Shares are normalised on the server, so a total that is not 100 is
          information rather than an error — but a dietitian aiming at 100 wants
          to know where they are, and the badge is quiet until they are off it.
        */}
        <Badge variant={percent === 100 ? 'muted' : 'attention'}>
          {t('intake.shareTotal', { value: percent })}
        </Badge>
      </div>

      <FieldError>{error}</FieldError>
    </div>
  );
}

function FormMessage({ state }: { state: IntakeFormState }) {
  const t = useTranslations('clients');
  if (state.status !== 'error') return null;

  return (
    <p role="status" className="me-auto text-body-sm text-destructive">
      {t(state.messageKey)}
    </p>
  );
}

function SubmitButton() {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? tCommon('loading') : t('intake.save')}
    </Button>
  );
}
