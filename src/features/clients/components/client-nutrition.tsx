import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComfortBand } from '@/components/ui/comfort-band';
import { Icon, type IconName } from '@/components/ui/icon';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { calculateAge } from '@/features/clients/age';
import { IntakeFormTrigger } from '@/features/clients/components/intake-form-trigger';
import { INTAKE_FIELD_COUNT, intakeGaps } from '@/features/clients/intake-gaps';
import { ALLERGENS } from '@/features/clients/nutrition';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import { type ClientIntakeValues } from '@/features/clients/types';
import { mealTypeForSlot, type MealType } from '@/features/weekly-plans/schema';
import { suggestProteinGrams, suggestTargets } from '@/features/weekly-plans/targets';
import { type Locale } from '@/i18n/routing';
import { isMember, membersOf } from '@/lib/enum';

/**
 * A client's nutrition record, read-only, with the dialog that writes it.
 *
 * The same relationship the Info tab has with the client card: the tab is what
 * you read, the dialog is what you write, and neither is a page you navigate
 * away to.
 *
 * ## What changed, and why
 *
 * **Three type sizes on one row.** Numeric facts were set at `heading-sm` with a
 * 12px unit beside them and non-numeric ones at `body-sm`, sharing a grid — so
 * "80 كغ", "زيادة الوزن" and "نشاط خفيف" sat in one row at three different sizes
 * with nothing aligned to anything. Every measurement is a `StatTile` now, which
 * is one size and one baseline by construction.
 *
 * **Cards with a heading and no contents.** `Facts` returned null when every
 * child was absent, but the `Card` around it still rendered — so a sparse record
 * drew three headed, empty boxes. A section with nothing in it does not render
 * at all now, and every gap collects into one dashed card at the end whose chips
 * open the dialog.
 *
 * **A record that contradicted itself in silence.** A manual calorie target far
 * from what the measurements imply is the most consequential thing this screen
 * can know, and it was drawn as a 12px note reading "يدوي".
 *
 * A server component. `IntakeFormTrigger` is the only client component here and
 * reads the record itself when opened, so none of this ships to the browser
 * twice.
 */
export function ClientNutrition({
  intake,
  locale,
}: {
  intake: ClientIntakeValues;
  locale: Locale;
}) {
  const t = useTranslations('clients');

  const age = intake.dateOfBirth ? calculateAge(intake.dateOfBirth) : null;

  const targets = suggestTargets({
    weightKg: intake.weightKg,
    heightCm: intake.heightCm,
    age,
    sex: intake.sex,
    activityLevel: intake.activityLevel,
    goal: intake.goal,
  });

  const effectiveKcal = intake.dailyKcalTarget ?? targets.suggestedKcal;
  const effectiveProtein = intake.proteinTargetGrams ?? suggestProteinGrams(intake.weightKg);
  const allergenTags = membersOf(ALLERGENS, intake.allergenTags);

  const goalLabel = isMember(CLIENT_GOALS, intake.goal) ? t(`goal.${intake.goal}`) : null;
  const activityLabel = isMember(CLIENT_ACTIVITY_LEVELS, intake.activityLevel)
    ? t(`activity.${intake.activityLevel}`)
    : null;

  const gaps = intakeGaps(intake);
  const filled = INTAKE_FIELD_COUNT - gaps.length;

  /*
   * A manual target more than a fifth away from what the measurements imply.
   * The record can hold this contradiction indefinitely, and before this it
   * never said so — a 1,200 kcal target against a weight-gain goal reads as
   * deliberate right up until somebody checks the arithmetic.
   */
  const kcalMismatch =
    intake.dailyKcalTarget !== null &&
    targets.suggestedKcal !== null &&
    Math.abs(intake.dailyKcalTarget - targets.suggestedKcal) / targets.suggestedKcal > 0.2
      ? { manual: intake.dailyKcalTarget, computed: targets.suggestedKcal }
      : null;

  const hasAllergyRecord =
    allergenTags.length > 0 ||
    intake.customAllergens.length > 0 ||
    Boolean(intake.allergies) ||
    Boolean(intake.conditions) ||
    Boolean(intake.medications);

  /*
   * `careNote` is in here rather than in a section of its own. It used to live
   * on a "what the client sees" card alongside the share-weight toggle; that
   * card is gone, and a note the dietitian writes *for* the client is guidance
   * that shapes the plan, so it belongs with the rest of the guidance. Leaving
   * it out entirely would have made it write-only — editable in the dialog and
   * visible nowhere.
   */
  const hasPlanningRecord =
    Boolean(intake.permanentInstructions) ||
    Boolean(intake.preferences) ||
    Boolean(intake.dislikes) ||
    Boolean(intake.careNote);

  const hasPrivateRecord = Boolean(intake.medicalNotes) || Boolean(intake.notes);

  return (
    <div className="flex flex-col gap-4">
      {/*
        One status card, carrying the edit control. A meter rather than a
        sentence: "13 / 22" answers "how much is left" at a glance, where
        "9 حقول غير مُدخلة" made the reader do the subtraction. The two states
        share a shape, so the button never moves between them.
      */}
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex min-w-60 flex-1 items-center gap-3">
              <span className="text-label text-muted-foreground">{t('intake.completeness')}</span>
              <span
                role="meter"
                aria-valuenow={filled}
                aria-valuemin={0}
                aria-valuemax={INTAKE_FIELD_COUNT}
                aria-valuetext={t('intake.filledOf', { filled, total: INTAKE_FIELD_COUNT })}
                aria-label={t('intake.completeness')}
                className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <span
                  aria-hidden
                  className="block h-full rounded-full bg-primary"
                  style={{ inlineSize: `${(filled / INTAKE_FIELD_COUNT) * 100}%` }}
                />
              </span>
              <span className="text-label tabular-nums" dir="ltr">
                {filled} / {INTAKE_FIELD_COUNT}
              </span>
            </div>

            <IntakeFormTrigger
              locale={locale}
              clientId={intake.clientId}
              className={buttonVariants({
                variant: targets.missing.length > 0 ? 'default' : 'neutral',
                size: 'sm',
              })}
            >
              <Icon name="edit" />
              {intake.hasProfile ? t('intake.edit') : t('intake.start')}
            </IntakeFormTrigger>
          </div>

          {targets.missing.length > 0 ? (
            <Callout tone="attention">
              {t('intake.missingFields', {
                fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
              })}
            </Callout>
          ) : null}

          {kcalMismatch ? (
            <Callout tone="attention" title={t('intake.kcalMismatch')}>
              {t('intake.kcalMismatchDetail', {
                manual: kcalMismatch.manual,
                computed: kcalMismatch.computed,
              })}
            </Callout>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle icon="progress" size="sm">
            {t('intake.sections.measurements')}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {goalLabel ? <Badge variant="muted">{goalLabel}</Badge> : null}
            {activityLabel ? <Badge variant="muted">{activityLabel}</Badge> : null}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <StatGrid columns={6}>
            <StatTile label={t('fields.heightCm')} value={intake.heightCm} unit={t('units.cm')} />
            {/*
              Whether the client can see this figure is a fact *about this
              figure*, so it sits under it. It used to be a row in a "what the
              client sees" card, which put a setting about the weight two cards
              away from the weight.
            */}
            <StatTile
              label={t('fields.weightKg')}
              value={intake.weightKg}
              unit={t('units.kg')}
              note={intake.shareWeightWithClient ? t('intake.shared') : t('intake.notShared')}
            />
            <StatTile label={t('fields.age')} value={age} unit={t('units.years')} />
            <StatTile
              label={t('intake.bmi')}
              value={targets.bmi === null ? null : targets.bmi.toFixed(1)}
              /*
               * The category is a note under the figure rather than appended to
               * it: "27.4 · زيادة وزن" sat one line under a goal reading "زيادة
               * الوزن", and two different facts in near-identical words on one
               * card is a card nobody trusts.
               */
              note={targets.bmiCategory ? t(`bmiCategories.${targets.bmiCategory}`) : undefined}
            />
            <StatTile
              label={t('intake.dailyTarget')}
              value={effectiveKcal}
              unit={t('units.kcal')}
              flagged={kcalMismatch !== null}
              note={
                effectiveKcal === null
                  ? undefined
                  : intake.dailyKcalTarget === null
                    ? t('intake.fromFormula')
                    : t('intake.override')
              }
            />
            <StatTile
              label={t('fields.proteinTargetGrams')}
              value={effectiveProtein}
              unit={t('units.g')}
              note={
                effectiveProtein === null || intake.proteinTargetGrams !== null
                  ? undefined
                  : t('intake.suggested')
              }
            />
          </StatGrid>

          {/*
            A bare 27.4 means nothing to most readers; against the healthy band
            it means "a little over". `ComfortBand` already draws exactly this —
            a track, a comfortable span and a marker — so the scale reuses the
            shared component rather than inventing a second one.
          */}
          {targets.bmi !== null && targets.bmiCategory ? (
            <BmiScale
              bmi={targets.bmi}
              label={t('intake.bmi')}
              valueText={t('intake.bmiValueText', {
                value: targets.bmi.toFixed(1),
                category: t(`bmiCategories.${targets.bmiCategory}`),
              })}
              offTarget={targets.bmiCategory !== 'normal'}
              scaleLabels={[
                t('bmiCategories.underweight'),
                t('bmiCategories.normal'),
                t('bmiCategories.overweight'),
                t('bmiCategories.obese'),
              ]}
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {intake.mealSchedule.length > 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle icon="clock" size="sm">
                {t('intake.sections.schedule')}
              </CardTitle>
              <Badge variant="muted">
                {t('intake.slotCount', { count: intake.mealSchedule.length })}
              </Badge>
            </CardHeader>
            <CardContent>
              <MealSchedule slots={intake.mealSchedule} />
            </CardContent>
          </Card>
        ) : null}

        {hasAllergyRecord ? (
          <Card>
            <CardHeader>
              <CardTitle icon="medical" size="sm">
                {t('intake.sections.allergies')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {allergenTags.length > 0 || intake.customAllergens.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {allergenTags.map((tag) => (
                    <Badge key={tag} variant="medical">
                      {t(`allergens.${tag}`)}
                    </Badge>
                  ))}
                  {/*
                    Outlined, not filled — the same distinction the intake dialog
                    draws. A solid clay badge means "the catalog excludes this";
                    these are recorded and sent to the model but exclude nothing,
                    and a reader glancing at this card has to be able to tell the
                    two apart without reading a legend.
                  */}
                  {intake.customAllergens.map((tag) => (
                    <Badge key={tag} variant="outline" className="border-dashed" dir="auto">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <Notes
                items={[
                  { label: t('intake.allergyDetailLabel'), value: intake.allergies },
                  { label: t('fields.conditions'), value: intake.conditions },
                  { label: t('fields.medications'), value: intake.medications },
                ]}
              />
            </CardContent>
          </Card>
        ) : null}

        {hasPlanningRecord ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle icon="weeklyPlans" size="sm">
                {t('intake.sections.planning')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Notes
                items={[
                  { label: t('fields.permanentInstructions'), value: intake.permanentInstructions },
                  { label: t('fields.preferences'), value: intake.preferences },
                  { label: t('fields.dislikes'), value: intake.dislikes },
                  { label: t('fields.careNote'), value: intake.careNote },
                ]}
              />
            </CardContent>
          </Card>
        ) : null}

        {hasPrivateRecord ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle icon="notes" size="sm">
                {t('intake.sections.private')}
              </CardTitle>
              <Badge variant="muted">{t('intake.privateBadge')}</Badge>
            </CardHeader>
            <CardContent>
              <Notes
                items={[
                  { label: t('fields.medicalNotes'), value: intake.medicalNotes },
                  { label: t('fields.notes'), value: intake.notes },
                ]}
              />
            </CardContent>
          </Card>
        ) : null}

      </div>

      {/*
        Every gap, once, at the end — instead of a headed empty card per section.
        Dashed and unfilled: `Card variant="empty"` is the system's "a space
        waiting to be filled", which is exactly what this is. Each chip opens the
        same dialog, so a gap is one click from being closed.
      */}
      {gaps.length > 0 ? (
        <Card variant="empty" size="sm">
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="text-body-md text-foreground">
                {t('intake.gapsHeading', { count: gaps.length })}
              </p>
              <IntakeFormTrigger
                locale={locale}
                clientId={intake.clientId}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {t('intake.fillGaps')}
              </IntakeFormTrigger>
            </div>

            <ul className="flex flex-wrap gap-1.5">
              {gaps.map((field) => (
                <li key={field}>
                  <IntakeFormTrigger
                    locale={locale}
                    clientId={intake.clientId}
                    className="rounded-full border border-dashed border-input px-3 py-1 text-label font-normal text-muted-foreground transition-colors hover:border-solid hover:border-primary hover:bg-secondary hover:text-secondary-foreground"
                  >
                    {t(`fields.${field}`)}
                  </IntakeFormTrigger>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * BMI drawn against the healthy range.
 *
 * The track spans 15–40, which covers every category the app names without
 * compressing the middle: the healthy band is 18.5–25, and on a 15–40 scale that
 * occupies a quarter of the width rather than a sliver.
 */
function BmiScale({
  bmi,
  label,
  valueText,
  offTarget,
  scaleLabels,
}: {
  bmi: number;
  label: string;
  valueText: string;
  offTarget: boolean;
  scaleLabels: [string, string, string, string];
}) {
  const MIN = 15;
  const MAX = 40;
  const percent = (value: number) => ((value - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="flex flex-col gap-2">
      <ComfortBand
        rangeStart={percent(18.5)}
        rangeWidth={percent(25) - percent(18.5)}
        // Clamped, so a reading outside the drawn scale marks its edge rather
        // than overflowing the track.
        marker={Math.min(100, Math.max(0, percent(bmi)))}
        offTarget={offTarget}
        label={label}
        valueText={valueText}
      />
      {/*
        Four labels, because the boundaries worth naming are 18.5 / 25 / 30. A
        fifth would need a tick at 35 that no label fits beside at this width.
      */}
      <div className="grid grid-cols-4 text-body-sm text-muted-foreground">
        {scaleLabels.map((text, index) => (
          <span key={text} className={index === 0 ? 'text-start' : 'text-center last:text-end'}>
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

const MEAL_ICONS = {
  breakfast: 'mealBreakfast',
  snack: 'mealSnack',
  lunch: 'mealLunch',
  dinner: 'mealDinner',
} as const satisfies Record<MealType, IconName>;

/**
 * The day's meals, in order, with their share of the target as width.
 *
 * A schedule is a sequence, and it was being drawn as an unordered wrap of
 * hand-rolled `bg-muted` chips — not `Badge`, not a tile — with nothing to say
 * which meal came first or how much of the day each one carried. `flex-grow`
 * taken from `kcalShare` puts both facts into the geometry: order runs along the
 * row, and a lunch carrying 35% is visibly wider than a snack carrying 15%.
 *
 * An `<ol>`, because the order is the content. The row mirrors in Arabic for
 * free — a flex row follows the document direction, so the earliest meal starts
 * at the inline-start edge in both languages.
 */
function MealSchedule({
  slots,
}: {
  slots: { slotKey: string; label: string; timeOfDay: string; kcalShare: number }[];
}) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row">
      {slots.map((slot) => (
        <li
          key={slot.slotKey}
          // `max` so a slot recorded at 0% still renders as a readable cell
          // rather than collapsing to nothing.
          style={{ flexGrow: Math.max(slot.kcalShare, 0.01) }}
          className="flex min-w-0 flex-col gap-1 rounded-md bg-muted px-3 py-2.5 sm:basis-0"
        >
          <span className="flex items-center gap-1.5 text-body-md font-medium" dir="auto">
            <Icon
              name={MEAL_ICONS[mealTypeForSlot(slot.slotKey)]}
              className="size-[1.0625rem] shrink-0 text-muted-foreground"
            />
            <span className="truncate">{slot.label}</span>
          </span>
          {/* A clock time and a percentage — bare digits, so genuinely LTR. */}
          <span className="text-body-sm tabular-nums text-muted-foreground" dir="ltr">
            {slot.timeOfDay} · {Math.round(slot.kcalShare * 100)}%
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * A stack of written notes. Renders nothing when every one of them is empty,
 * which is what lets its card be omitted rather than drawn hollow.
 */
function Notes({ items }: { items: { label: string; value: string | null }[] }) {
  const present = items.filter((item) => item.value !== null && item.value !== '');
  if (present.length === 0) return null;

  return (
    <dl className="flex flex-col gap-3">
      {present.map((item) => (
        <div key={item.label}>
          <dt className="text-label text-muted-foreground">{item.label}</dt>
          <dd
            className="mt-1 text-body-md whitespace-pre-line text-foreground [overflow-wrap:anywhere]"
            dir="auto"
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
