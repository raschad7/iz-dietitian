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
import {
  HEIGHT_CM_RANGE,
  isValidationKey,
  MEASUREMENT_MAX_DIGITS,
  VALIDATION_VALUES,
  WEIGHT_KG_RANGE,
} from '@/features/clients/form-rules';
import { initialIntakeFormState, type IntakeFormState } from '@/features/clients/form-state';
import { balanceToHundred } from '@/features/clients/meal-split';
import { mergedNotes } from '@/features/clients/notes';
import {
  ALLERGENS,
  BLOOD_TYPES,
  CLIENT_MARITAL_STATUSES,
  INTAKE_FREQUENCIES,
  SMOKING_HABITS,
} from '@/features/clients/nutrition';
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

/**
 * The six food-frequency questions, in the order the paper sheet asks them.
 *
 * A list rather than six copies of the same twelve-line select: every one of
 * them is the same control over the same scale, differing only in its label, and
 * writing them out would be six chances for one to drift onto a different set of
 * options. Typed as keys of `ClientIntakeValues`, so a field renamed on the
 * record and not here fails to compile.
 */
const FREQUENCY_FIELDS = [
  'caffeineFrequency',
  'sweetDrinksFrequency',
  'fastFoodFrequency',
  'vegetablesFrequency',
  'fruitFrequency',
  'dairyFrequency',
  'redMeatFrequency',
  'chickenFrequency',
  'fishFrequency',
  'sweetsFrequency',
] as const satisfies readonly (keyof ClientIntakeValues)[];

/** The icon that stands for each section in the rail. */
const SECTION_ICONS = {
  measurements: 'progress',
  background: 'personOutline',
  habits: 'activityOutline',
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

  /**
   * The server's complaint about one field.
   *
   * The four required measurements report **keys** — see `VALIDATION_KEYS` in
   * `../form-rules` — because this app is read in Arabic and Zod's own defaults
   * are English prose. Every other field on this form still reports Zod's
   * default, so an unrecognised value is passed through rather than dropped:
   * hiding it would turn a rejected save into a form that silently refuses.
   */
  const errorFor = (field: string) => {
    const message = state.status === 'error' ? state.fieldErrors?.[field]?.[0] : undefined;
    if (message === undefined) return undefined;

    return isValidationKey(message) ? t(`validation.${message}`, VALIDATION_VALUES) : message;
  };

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
    background: Boolean(
      intake.maritalStatus ||
        intake.childrenCount !== null ||
        intake.bloodType ||
        intake.occupation?.trim() ||
        intake.visitReason?.trim() ||
        intake.dietHistory?.trim() ||
        intake.familyHistory?.trim(),
    ),
    habits: Boolean(
      intake.activityNotes?.trim() ||
        intake.activityBarriers?.trim() ||
        intake.sleepHours !== null ||
        intake.smoking ||
        FREQUENCY_FIELDS.some((field) => intake[field]),
    ),
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
    /*
      `noValidate`, for the same reason the client card carries it: the four
      required measurements are a number input and two selects, and a native
      `required` on the input would pop a grey browser bubble while the selects
      showed the red edge and the message. One validator — `intakeSchema` — so
      every field fails the same way and says so in the same place.
    */
    <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col text-start">
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
              {/*
                All four fields in this panel are required — they are what the
                calorie formula runs on. See the ⚠ on `intakeSchema`: they are
                the exception on a form that is otherwise optional to the last
                field, and the rest of it must not follow.
              */}
              <NumberField
                name="heightCm"
                label={t('fields.heightCm')}
                icon="heightOutline"
                placeholder={t('intake.placeholders.heightCm')}
                min={HEIGHT_CM_RANGE.min}
                max={HEIGHT_CM_RANGE.max}
                step={1}
                /*
                  Three digits, which is exactly what the bound above allows:
                  300 cm and 200 kg are both three-digit numbers, so a fourth
                  digit can only ever be a value the schema would reject. Better
                  refused at the keystroke than accepted and complained about.
                */
                maxDigits={MEASUREMENT_MAX_DIGITS}
                required
                value={heightCm}
                onChange={setHeightCm}
                error={errorFor('heightCm')}
              />
              <NumberField
                name="weightKg"
                label={t('fields.weightKg')}
                icon="weightOutline"
                placeholder={t('intake.placeholders.weightKg')}
                min={WEIGHT_KG_RANGE.min}
                max={WEIGHT_KG_RANGE.max}
                step={0.5}
                // Digits, not characters — `70.5` still fits. See `maxDigits`.
                maxDigits={MEASUREMENT_MAX_DIGITS}
                required
                value={weightKg}
                onChange={setWeightKg}
                error={errorFor('weightKg')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="goal" required>
                  {t('fields.goal')}
                </Label>
                <SelectField
                  id="goal"
                  name="goal"
                  value={goal}
                  onValueChange={setGoal}
                  placeholder={t('intake.choose')}
                  aria-required
                  aria-invalid={errorFor('goal') !== undefined || undefined}
                  /*
                    ⚠ **No "Not provided" row any more.** It was here so that a
                    goal chosen by mistake could be un-chosen without reloading
                    the page — a good reason while the field was optional, and
                    now an offer of the one answer the form will refuse to save.
                    A required field has no valid empty state to walk back to;
                    the placeholder covers the not-yet-chosen case.
                  */
                  options={CLIENT_GOALS.map((value) => ({ value, label: t(`goal.${value}`) }))}
                />
                <FieldError>{errorFor('goal')}</FieldError>
              </Field>

              <Field>
                <Label htmlFor="activityLevel" required>
                  {t('fields.activityLevel')}
                </Label>
                <SelectField
                  id="activityLevel"
                  name="activityLevel"
                  value={activityLevel}
                  onValueChange={setActivityLevel}
                  placeholder={t('intake.choose')}
                  aria-required
                  aria-invalid={errorFor('activityLevel') !== undefined || undefined}
                  options={CLIENT_ACTIVITY_LEVELS.map((value) => ({
                    value,
                    label: t(`activity.${value}`),
                  }))}
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


          {/*
            The clinic's paper assessment sheet, split across two panels.

            One panel would have been eighteen questions in a single scroll —
            the exact shape the rail exists to avoid. They split where the sheet
            itself does: who the person is and what brought them here, then how
            they live. Everything on both panels is optional, and the fixed
            answers are selects rather than text so two records taken months
            apart can be read against each other.
          */}
          <Panel id="background" current={section}>
            <p className="text-body-sm text-muted-foreground">{t('intake.backgroundHint')}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <ChoiceField
                name="maritalStatus"
                label={t('fields.maritalStatus')}
                defaultValue={intake.maritalStatus ?? ''}
                options={CLIENT_MARITAL_STATUSES.map((value) => ({
                  value,
                  label: t(`maritalStatus.${value}`),
                }))}
                error={errorFor('maritalStatus')}
              />
              {/*
                A count, not a "has children" switch followed by a number: the
                count answers both, and 0 is a different answer from a blank —
                one says none, the other says nobody asked.
              */}
              <NumberField
                name="childrenCount"
                label={t('fields.childrenCount')}
                icon="clients"
                placeholder={t('intake.placeholders.childrenCount')}
                min={0}
                max={20}
                step={1}
                defaultValue={intake.childrenCount?.toString() ?? ''}
                error={errorFor('childrenCount')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ChoiceField
                name="bloodType"
                label={t('fields.bloodType')}
                defaultValue={intake.bloodType ?? ''}
                options={BLOOD_TYPES.map((value) => ({
                  value,
                  label: t(`bloodType.${value}`),
                }))}
                error={errorFor('bloodType')}
              />
              <Field>
                <Label htmlFor="occupation">{t('fields.occupation')}</Label>
                <Input
                  id="occupation"
                  name="occupation"
                  maxLength={120}
                  defaultValue={intake.occupation ?? ''}
                  placeholder={t('intake.placeholders.occupation')}
                />
                <FieldError>{errorFor('occupation')}</FieldError>
              </Field>
            </div>

            <TextField
              name="visitReason"
              label={t('fields.visitReason')}
              placeholder={t('intake.placeholders.visitReason')}
              rows={3}
              maxLength={1000}
              defaultValue={intake.visitReason}
              error={errorFor('visitReason')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="dietHistory"
                label={t('fields.dietHistory')}
                placeholder={t('intake.placeholders.dietHistory')}
                rows={3}
                maxLength={1000}
                defaultValue={intake.dietHistory}
                error={errorFor('dietHistory')}
              />
              <TextField
                name="familyHistory"
                label={t('fields.familyHistory')}
                placeholder={t('intake.placeholders.familyHistory')}
                rows={3}
                maxLength={1000}
                defaultValue={intake.familyHistory}
                error={errorFor('familyHistory')}
              />
            </div>
          </Panel>

          <Panel id="habits" current={section}>
            <p className="text-body-sm text-muted-foreground">{t('intake.habitsHint')}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="activityNotes"
                label={t('fields.activityNotes')}
                placeholder={t('intake.placeholders.activityNotes')}
                rows={3}
                maxLength={1000}
                defaultValue={intake.activityNotes}
                error={errorFor('activityNotes')}
              />
              <TextField
                name="activityBarriers"
                label={t('fields.activityBarriers')}
                placeholder={t('intake.placeholders.activityBarriers')}
                rows={3}
                maxLength={1000}
                defaultValue={intake.activityBarriers}
                error={errorFor('activityBarriers')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                name="sleepHours"
                label={t('fields.sleepHours')}
                icon="clock"
                placeholder={t('intake.placeholders.sleepHours')}
                min={0}
                max={16}
                /*
                  Half-hours, because "six and a half" is how the question gets
                  answered. A whole-hour step would round it on the way in.
                */
                step={0.5}
                defaultValue={intake.sleepHours?.toString() ?? ''}
                error={errorFor('sleepHours')}
              />
              <ChoiceField
                name="smoking"
                label={t('fields.smoking')}
                defaultValue={intake.smoking ?? ''}
                options={SMOKING_HABITS.map((value) => ({
                  value,
                  label: t(`smoking.${value}`),
                }))}
                error={errorFor('smoking')}
              />
            </div>

            <Divider label={t('intake.frequencyLegend')} />

            {/*
              Ten questions on one scale, so the panel is one column of labels
              against one column of identical selects. The period each question
              is asked over — a day or a week — is in its label, which is where
              the paper sheet puts it too.

              Ten and not six because four questions each covered more than one
              food: caffeine was asked together with sweetened drinks, vegetables
              together with fruit, and beef, chicken and fish shared a single
              answer. One scale answered once per food is the same control
              repeated, which is why splitting them costs rows of the grid and
              nothing else.
            */}
            <div className="grid gap-4 sm:grid-cols-2">
              {FREQUENCY_FIELDS.map((name) => (
                <ChoiceField
                  key={name}
                  name={name}
                  label={t(`fields.${name}`)}
                  defaultValue={intake[name] ?? ''}
                  options={INTAKE_FREQUENCIES.map((value) => ({
                    value,
                    label: t(`frequency.${value}`),
                  }))}
                  error={errorFor(name)}
                />
              ))}
            </div>
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

            {/*
              Drug allergies, which had no control at all.

              The column exists, `intakeSchema` validates it, the Nutrition tab
              renders it, and `FIELDS_BY_SECTION` files it on this panel — the
              only missing piece was the field itself, so the record could show
              a drug allergy that nothing in the app could ever write. It sits
              here rather than in Background for the reason that mapping already
              gives: someone looking for what a client reacts to should find
              every answer on one panel.
            */}
            <TextField
              name="drugAllergies"
              label={t('fields.drugAllergies')}
              placeholder={t('intake.placeholders.drugAllergies')}
              rows={3}
              maxLength={1000}
              defaultValue={intake.drugAllergies}
              error={errorFor('drugAllergies')}
            />
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
 * A select over a closed answer, uncontrolled — the form posts it.
 *
 * The blank row is the first option rather than only placeholder text, for the
 * same reason the goal select carries one: an assessment is a form someone can
 * walk back, and an answer picked by mistake has to be un-pickable without
 * reloading the page.
 */
function ChoiceField({
  name,
  label,
  defaultValue,
  options,
  error,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: readonly { value: string; label: string }[];
  error?: string;
}) {
  const t = useTranslations('clients');

  return (
    <Field>
      <Label htmlFor={name}>{label}</Label>
      <SelectField
        id={name}
        name={name}
        defaultValue={defaultValue}
        placeholder={t('notProvided')}
        options={[{ value: '', label: t('notProvided') }, ...options]}
      />
      <FieldError>{error}</FieldError>
    </Field>
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
  required,
  maxDigits,
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
  /**
   * Draws the `*` after the label and announces the field as required.
   *
   * Not the native `required` attribute: the form is `noValidate` so that one
   * validator reports every field in one style — see the note on the `<form>`.
   */
  required?: boolean;
  /**
   * How many digits may be typed into the box.
   *
   * ⚠ **Not `maxLength`.** That attribute is inert on `<input type="number">` —
   * the HTML spec applies it to text, search, url, tel, email and password only
   * — so a `maxLength={3}` here would look like a rule and enforce nothing. The
   * cap is applied in the change handler instead, which rejects the keystroke
   * (and a paste) rather than truncating after the fact.
   *
   * Counts **digits**, not characters, so the decimal separator on a weight is
   * not one of the three: `70.5` is three digits and fits.
   *
   * Requires `onChange` — an uncontrolled field has no current value to fall
   * back to when a keystroke is refused, so passing this without it does
   * nothing.
   */
  maxDigits?: number;
}) {
  /*
    Refusing a keystroke, rather than clamping the value.

    Returning without calling `onChange` leaves the controlled value where it
    was, so the fourth digit simply does not appear. Trimming to three instead
    would silently rewrite what somebody typed — a 1750 mistyped for 175 would
    become 175 and read as accepted.
  */
  const handleChange = (next: string) => {
    if (!onChange) return;

    const digits = (next.match(/\d/g) ?? []).length;
    if (maxDigits !== undefined && digits > maxDigits) return;

    onChange(next);
  };

  return (
    <Field>
      <Label htmlFor={name} required={required}>
        {label}
      </Label>
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
          aria-required={required || undefined}
          /*
            The group paints the red edge from this, via its own
            `has-[[data-slot][aria-invalid=true]]:border-destructive` — so the
            whole control turns, not just the bare input inside it.
          */
          aria-invalid={error !== undefined || undefined}
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
            ? { value: value ?? '', onChange: (event) => handleChange(event.target.value) }
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

/**
 * One figure of the readout: a caption, the number, and what the number is.
 *
 * **The direction lock is on the value, not on the line.** `dir="ltr"` on the
 * `<strong>` set that element's own base direction, and `text-align: start`
 * resolves against whatever element it lands on — so in Arabic the caption and
 * the note sat against the right edge of the cell, as the whole dialog does,
 * and "1994 kcal" sat against the left. Three columns of it read as a figure
 * that had come loose from the words above and below it. The same mistake the
 * `NumberField` group above documents, one element further in.
 *
 * `<bdi>` is what the lock actually wanted to say: isolate this run so the
 * text around it cannot reorder it, and leave the line itself in the page's
 * direction so it aligns with its own caption. Its `dir="auto"` also gets the
 * units right in a way a hardcoded `ltr` could not — the first strong character
 * of "1994 kcal" is Latin and the run lays out left-to-right, while the first
 * of "134 غ" is Arabic and it lays out right-to-left. Both then read in the
 * order they were written, which one fixed direction for both cannot do.
 */
function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-caption text-muted-foreground">{label}</span>
      <strong className="font-heading text-heading-sm font-semibold tabular-nums">
        <bdi>{value}</bdi>
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
          {/*
            No `dir="ltr"`, for the reason `NumberField` gives above: it pinned
            the digits to the left edge of the box in Arabic while every other
            field on the dialog filled from the right, so one cell of the
            schedule row read against the grain of the rest. A number is a
            left-to-right run under the bidi algorithm in either script — the
            share still reads as the share, it is simply aligned to the edge the
            form is read from.
          */}
          <Input
            name="slotShare"
            type="number"
            min={0}
            max={100}
            value={Math.round(slot.kcalShare * 100)}
            onChange={(event) => {
              const nextPercent = Number(event.target.value);
              onChange(
                slots.map((current, position) =>
                  position === index
                    ? { ...current, kcalShare: Number.isFinite(nextPercent) ? nextPercent / 100 : 0 }
                    : current,
                ),
              );
            }}
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={percent === 100}
          onClick={() => {
            const balanced = balanceToHundred(slots.map((slot) => Math.round(slot.kcalShare * 100)));
            onChange(
              slots.map((slot, position) => ({ ...slot, kcalShare: balanced[position]! / 100 })),
            );
          }}
        >
          {t('intake.balanceShares')}
        </Button>

        <Badge variant={percent === 100 ? 'muted' : 'attention'}>
          {t('intake.shareTotal', { value: percent })}
        </Badge>
      </div>

      <FieldError>{error}</FieldError>
    </div>
  );
}

/**
 * The dialog's own message, for a failure no field can explain.
 *
 * ⚠ **`errors.invalid` renders nothing**, matching the client card. It said
 * "check the fields highlighted in red" — a sentence from when the fields
 * themselves said nothing useful, and now a footer repeating what a red edge and
 * a message beside each field already say. The rail switches to the panel
 * holding the error, so the reader is looking straight at it.
 *
 * `errors.unexpected` and `errors.clientNotFound` still show: neither is about a
 * field, and without them the dialog would swallow the failure.
 */
function FormMessage({ state }: { state: IntakeFormState }) {
  const t = useTranslations('clients');
  if (state.status !== 'error' || state.messageKey === 'errors.invalid') return null;

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
