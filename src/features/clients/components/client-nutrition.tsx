import { useFormatter, useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { calculateAge } from '@/features/clients/age';
import { IntakeFormTrigger } from '@/features/clients/components/intake-form-trigger';
import { INTAKE_FIELD_COUNT, intakeGaps } from '@/features/clients/intake-gaps';
import {
  type IntakeSectionId,
  isGroupedGapSection,
  sectionForField,
} from '@/features/clients/intake-sections';
import { mergedNotes } from '@/features/clients/notes';
import {
  ALLERGENS,
  BLOOD_TYPES,
  CLIENT_MARITAL_STATUSES,
  INTAKE_FREQUENCIES,
  SMOKING_HABITS,
} from '@/features/clients/nutrition';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import { type ClientIntakeValues } from '@/features/clients/types';
import { mealTypeForSlot, type MealType } from '@/features/weekly-plans/schema';
import {
  type BmiCategory,
  suggestProteinGrams,
  suggestTargets,
} from '@/features/weekly-plans/targets';
import { type Locale } from '@/i18n/routing';
import { isMember, membersOf } from '@/lib/enum';
import { cn } from '@/lib/utils';

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
 * '80 كغ', 'زيادة الوزن' and 'نشاط خفيف' sat in one row at three different sizes
 * with nothing aligned to anything. Every measurement is a `StatTile` now, which
 * is one size and one baseline by construction.
 *
 * **Cards with a heading and no contents.** `Facts` returned null when every
 * child was absent, but the `Card` around it still rendered — so a sparse record
 * drew three headed, empty boxes. This has been both ways since: sections
 * stopped rendering when empty, then went back to always drawing so the
 * record's shape would not change from client to client.
 *
 * **A section with nothing in it draws no card.** That is the arrangement now,
 * and the objection to it — that a reader cannot tell "none recorded" from "not
 * on this screen" — is answered somewhere better than a headed empty box: the
 * dashed gap card at the foot names every missing section as a chip and opens
 * the dialog on it. One place listing what the record lacks beats seven boxes
 * each saying it about themselves, and a filled record is now only the cards
 * that have something on them. See the flags above the return.
 *
 * **A record that contradicted itself in silence.** A manual calorie target far
 * from what the measurements imply is the most consequential thing this screen
 * can know, and it was drawn as a 12px note reading 'يدوي'.
 *
 * **Chips that were decoration.** Goal, activity level, the meal count and
 * 'clinic only' were each a filled pill, and with the status pill in the header
 * and a count on the tab there were six of them on one screen. A pill is how
 * this system marks a *state*; a client's goal is a fact, and stating six facts
 * that way leaves the reader nothing to tell apart. They are words now.
 *
 * **Notes under the figures.** Every tile carried a second line — 'محسوب',
 * 'مقترح', 'فوق النطاق الصحي' — and the last of those repeated, in words, the
 * comfort band drawn directly beneath it. The lattice is a label over a figure
 * and nothing else, centred so six readings scan across as one row.
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
  const format = useFormatter();

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
   * The chips the gaps card offers, which are not one per missing field.
   *
   * A gap in a grouped section collapses into a single chip named after the
   * section — `GROUPED_GAP_SECTIONS` says which, and why. Everything else still
   * names the field it takes you to, and every chip opens the dialog on the
   * panel that actually holds it.
   *
   * Built by walking `gaps`, so a group chip appears where its first missing
   * field would have: the card keeps the order the intake itself is worked
   * through rather than hoisting the groups to the front.
   */
  const gapChips: { key: string; label: string; section: IntakeSectionId }[] = [];
  const grouped = new Set<IntakeSectionId>();

  for (const field of gaps) {
    const section = sectionForField(field);

    if (!isGroupedGapSection(section)) {
      gapChips.push({ key: field, label: t(`fields.${field}`), section });
      continue;
    }

    if (grouped.has(section)) continue;
    grouped.add(section);
    gapChips.push({
      key: section,
      label: t(`intake.sections.${section}`),
      section,
    });
  }

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
    Boolean(intake.drugAllergies) ||
    allergenTags.length > 0 ||
    intake.customAllergens.length > 0 ||
    Boolean(intake.allergies) ||
    Boolean(intake.conditions) ||
    Boolean(intake.medications);

  const hasPlanningRecord =
    Boolean(intake.permanentInstructions) ||
    Boolean(intake.preferences) ||
    Boolean(intake.dislikes);

  const hasPrivateRecord = Boolean(intake.medicalNotes) || Boolean(intake.notes);

  /*
   * The assessment questionnaire, in the two halves the dialog writes it in.
   *
   * Two flags rather than one: the sheet is filled in across visits, so a
   * client can have answered the background questions and none of the habits
   * ones, and each card decides for itself whether it has a record to show —
   * or, having none, stays off the screen entirely.
   */
  const backgroundFacts = [
    {
      label: t('fields.maritalStatus'),
      value: isMember(CLIENT_MARITAL_STATUSES, intake.maritalStatus)
        ? t(`maritalStatus.${intake.maritalStatus}`)
        : null,
    },
    {
      label: t('fields.childrenCount'),
      // `!== null` and not a truthiness check: zero children is an answer.
      value: intake.childrenCount !== null ? format.number(intake.childrenCount) : null,
    },
    {
      label: t('fields.bloodType'),
      value: isMember(BLOOD_TYPES, intake.bloodType) ? t(`bloodType.${intake.bloodType}`) : null,
    },
    { label: t('fields.occupation'), value: intake.occupation },
  ];

  const habitFacts = [
    {
      label: t('fields.sleepHours'),
      value: intake.sleepHours !== null ? t('intake.hoursValue', { value: intake.sleepHours }) : null,
    },
    {
      label: t('fields.smoking'),
      value: isMember(SMOKING_HABITS, intake.smoking) ? t(`smoking.${intake.smoking}`) : null,
    },
    ...FREQUENCY_DISPLAY_FIELDS.map((field) => ({
      label: t(`fields.${field}`),
      value: isMember(INTAKE_FREQUENCIES, intake[field]) ? t(`frequency.${intake[field]}`) : null,
    })),
  ];

  const backgroundNotes = [
    { label: t('fields.visitReason'), value: intake.visitReason },
    { label: t('fields.dietHistory'), value: intake.dietHistory },
    { label: t('fields.familyHistory'), value: intake.familyHistory },
  ];

  const habitNotes = [
    { label: t('fields.activityNotes'), value: intake.activityNotes },
    { label: t('fields.activityBarriers'), value: intake.activityBarriers },
  ];

  const hasBackgroundRecord = [...backgroundFacts, ...backgroundNotes].some((item) => item.value);
  const hasHabitsRecord = [...habitFacts, ...habitNotes].some((item) => item.value);
  const hasScheduleRecord = intake.mealSchedule.length > 0;

  /*
    ⚠ **A section with nothing in it draws no card**, and these are what decide
    it — one flag per section, plus the stacks and grids that would otherwise be
    left holding nothing.

    This reverses what the module note above records. The argument for drawing
    every card, filled or not, was that a record whose *shape* changes from
    client to client makes a reader hunt: on a sparse record you could not tell
    "nothing recorded" from "not on this screen". That reasoning stands, and it
    is answered by the dashed gap card at the foot rather than by seven headed
    boxes — every missing section is named there as a chip (see
    `GROUPED_GAP_SECTIONS`), so the record still says what it does not hold and
    still offers one click to fill it. What it no longer does is spend a third
    of the screen per empty section saying so.

    **The stack and grid flags are not optional tidiness.** An empty flex child
    still occupies its grid column, so a two-thirds stack with both cards hidden
    would leave the narrow column stranded beside dead space — the same trap the
    note on the grid below already warns about.
  */
  const hasWideStack = hasScheduleRecord || hasPlanningRecord;
  const hasNarrowStack = hasAllergyRecord || hasPrivateRecord;
  const hasRecordGrid = hasWideStack || hasNarrowStack;
  const hasAssessmentGrid = hasBackgroundRecord || hasHabitsRecord;

  return (
    <div className="flex flex-col gap-4">
      {/*
        The meter lives in the header of the card it describes. It used to be a
        card of its own — no title, no heading, floating above four cards that
        all had both — and it carried an `تعديل` button directly under the
        header's own `تعديل`: two identical labels a few pixels apart opening
        two different dialogs. This one names its object.
      */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <CardTitle as="h2" icon="progress" size="sm">
            {t('intake.sections.measurements')}
          </CardTitle>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-label text-muted-foreground">
              {t('intake.completeShort')}
            </span>
            <span
              role="meter"
              aria-valuenow={filled}
              aria-valuemin={0}
              aria-valuemax={INTAKE_FIELD_COUNT}
              aria-valuetext={t('intake.filledOf', {
                filled,
                total: INTAKE_FIELD_COUNT,
              })}
              aria-label={t('intake.completeness')}
              className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
            >
              <span
                aria-hidden
                className="block h-full rounded-full bg-primary"
                style={{
                  inlineSize: `${(filled / INTAKE_FIELD_COUNT) * 100}%`,
                }}
              />
            </span>
            <span className="text-label tabular-nums" dir="ltr">
              {filled}/{INTAKE_FIELD_COUNT}
            </span>

            <IntakeFormTrigger
              locale={locale}
              clientId={intake.clientId}
              className={buttonVariants({ variant: 'default', size: 'sm' })}
            >
              <Icon name="edit" />
              {intake.hasProfile ? t('intake.editRecord') : t('intake.start')}
            </IntakeFormTrigger>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/*
            Goal and activity as a sentence rather than two pills. They are
            facts about the client, not states of the record, and the design
            system spends its pill shape on the latter.
          */}
          {goalLabel || activityLabel ? (
            <p className="flex flex-wrap items-center gap-x-6 gap-y-1 text-body-sm text-muted-foreground">
              {goalLabel ? (
                <span>
                  {t('intake.goalLine')}{' '}
                  <span className="font-semibold text-foreground">
                    {goalLabel}
                  </span>
                </span>
              ) : null}
              {activityLabel ? (
                <span>
                  {t('intake.activityLine')}{' '}
                  <span className="font-semibold text-foreground">
                    {activityLabel}
                  </span>
                </span>
              ) : null}
            </p>
          ) : null}

          {targets.missing.length > 0 ? (
            <Callout tone="attention">
              {t('intake.missingFields', {
                // `format.list` and not a hardcoded '، ': that separator was an
                // Arabic comma typed into the component, so the English build
                // was joining its own field names with it too.
                fields: format.list(
                  targets.missing.map((field) => t(`fields.${field}`)),
                ),
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

          {/*
            No `note` on any tile. 'محسوب' / 'مقترح' said where a number came
            from, and 'فوق النطاق الصحي' repeated in words the band drawn
            immediately below it. A reading is a label and a figure.
          */}
          <StatGrid columns={6}>
            <StatTile
              label={t('fields.heightCm')}
              value={intake.heightCm}
              unit={t('units.cm')}
            />
            <StatTile
              label={t('fields.weightKg')}
              value={intake.weightKg}
              unit={t('units.kg')}
            />
            <StatTile
              label={t('fields.age')}
              value={age}
              unit={t('units.years')}
            />
            <StatTile
              label={t('intake.bmi')}
              value={targets.bmi === null ? null : targets.bmi.toFixed(1)}
            />
            <StatTile
              label={t('intake.dailyTarget')}
              value={effectiveKcal}
              unit={t('units.kcal')}
              flagged={kcalMismatch !== null}
            />
            <StatTile
              label={t('fields.proteinTargetGrams')}
              value={effectiveProtein}
              unit={t('units.g')}
            />
          </StatGrid>
        </CardContent>
      </Card>

      {/*
        ⚠ **The scale is a card of its own, not the last row of the one above.**

        Inside the measurements card it was read as a footer to the six figures
        rather than as a chart — an unlabelled rule under a grid, close enough to
        the tiles to look like part of the same object, and the only element on
        that card with no name of its own. It also answers a different question
        from the tiles: they say what the numbers *are*, this says where this
        person *falls*, which is the reading a dietitian actually acts on.

        Given its own card it gets a title naming what is plotted, and the gap
        between the two cards does the separating that a hairline inside one card
        could not. A bare 27.4 still means nothing to most readers; against the
        named categories it means 'a little over'. See `BmiScale` for why this is
        no longer a `ComfortBand`.
      */}
      {targets.bmi !== null && targets.bmiCategory ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" icon="trend" size="sm">
              {t('intake.bmi')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BmiScale
              bmi={targets.bmi}
              category={targets.bmiCategory}
              label={t('intake.bmi')}
              valueText={t('intake.bmiValueText', {
                value: targets.bmi.toFixed(1),
                category: t(`bmiCategories.${targets.bmiCategory}`),
              })}
              scaleLabels={{
                underweight: t('bmiCategories.underweight'),
                normal: t('bmiCategories.normal'),
                overweight: t('bmiCategories.overweight'),
                obese: t('bmiCategories.obese'),
                severely_obese: t('bmiCategories.severely_obese'),
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {/*
        ⚠ **Two independent column stacks, not four cards in one grid.**
        A `grid-cols-3` holding a 2-column card beside a 1-column card puts the
        next pair on a new grid *row*, and a row is as tall as its tallest
        member — so a short meal schedule beside a long allergy record left a
        hole under the schedule the height of the difference, and the planning
        card started well below where it looked like it should. `items-start`
        made each card the right height and did nothing about the row.

        Each column is its own flex stack now, so a card follows the one above
        it with exactly `gap-4` between them and nothing waits on the other
        column. Below `lg` both stacks collapse into one, which is what a single
        column of cards should look like anyway.

        Each stack renders only when it has something in it: an empty flex child
        still occupies its grid column, which would leave the other stack at
        two-thirds width with dead space beside it.
      */}
      {/*
        A section draws its card only when it holds something.

        The counter-argument is on the record: the same seven cards in the same
        order on every client is what lets a reader learn where the allergies
        are once. What that cost was a third of a screen per empty section, on
        the screen that is already the densest in the app — and on a new client,
        seven headed boxes saying nothing before a single fact is on it.

        What makes it safe to drop them is that nothing is silently absent: the
        gap card at the foot lists every missing section by name and opens the
        dialog on it, so "not recorded" is stated once, in one place, with the
        way to fix it attached. The cards on screen are the record; the card at
        the foot is what is missing from it.
      */}
      {hasRecordGrid ? (
      /*
        **The three-column split only exists when there are two stacks to
        split.** With one of them hidden the survivor still sat in its own
        track — the wide one across two thirds, the narrow one across one — and
        the rest of the row was dead space beside a single card. A two-column
        layout with one column is a one-column layout, so it is drawn as one.
      */
      <div className={cn('grid items-start gap-4', hasWideStack && hasNarrowStack && 'lg:grid-cols-3')}>
          {hasWideStack ? (
          <div className={cn('flex flex-col gap-4', hasNarrowStack && 'lg:col-span-2')}>
            {hasScheduleRecord ? (
            <Card>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <CardTitle as="h2" icon="clock" size="sm">
                    {t('intake.sections.schedule')}
                  </CardTitle>
                  {/*
                What the schedule adds up to, in words. This was a pill counting
                the slots — a number the row below it already shows by existing.
                Saying which target the shares divide is the part that is not on
                screen anywhere else.
              */}
                  <p className="text-body-sm text-muted-foreground">
                    {t('intake.scheduleSummary', {
                      count: intake.mealSchedule.length,
                      kcal: effectiveKcal ?? '—',
                    })}
                  </p>
                </CardHeader>
                <CardContent>
                  <MealSchedule slots={intake.mealSchedule} />
                </CardContent>
              </Card>
            ) : null}

            {hasPlanningRecord ? (
            <Card>
                <CardHeader>
                  <CardTitle as="h2" icon="weeklyPlans" size="sm">
                    {t('intake.sections.planning')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Notes
                      items={[
                        {
                          label: t('fields.permanentInstructions'),
                          value: intake.permanentInstructions,
                        },
                        {
                          label: t('fields.preferences'),
                          value: intake.preferences,
                        },
                        { label: t('fields.dislikes'), value: intake.dislikes },
                      ]}
                    />
                </CardContent>
              </Card>
            ) : null}

          </div>
          ) : null}

          {hasNarrowStack ? (
          <div className="flex flex-col gap-4">
            {hasAllergyRecord ? (
            <Card>
                <CardHeader>
                  <CardTitle as="h2" icon="medical" size="sm">
                    {t('intake.sections.allergies')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/*
                The allergens are a labelled line in the same list as the rest of
                the clinical record, not a row of pills above it. They read in
                clay, which is what marks a medical fact — the pill added a
                filled shape around information that was already the loudest
                thing on the card. The catalog/free-text distinction the filled
                and outlined pills used to draw is the intake dialog's job; on a
                read-only card it was a legend nobody had.
              */}
                  <Notes
                      items={[
                        {
                          label: t('intake.allergyLine'),
                          value:
                            allergenTags.length > 0 ||
                            intake.customAllergens.length > 0
                              ? format.list([
                                  ...allergenTags.map((tag) =>
                                    t(`allergens.${tag}`),
                                  ),
                                  ...intake.customAllergens,
                                ])
                              : null,
                          medical: true,
                        },
                        {
                          label: t('intake.allergyDetailLabel'),
                          value: intake.allergies,
                        },
                        {
                          label: t('fields.conditions'),
                          value: intake.conditions,
                        },
                        {
                          label: t('fields.medications'),
                          value: intake.medications,
                        },
                        {
                          label: t('fields.drugAllergies'),
                          value: intake.drugAllergies,
                          medical: true,
                        },
                      ]}
                    />
                </CardContent>
              </Card>
            ) : null}

            {hasPrivateRecord ? (
            <Card>
                <CardHeader>
                  {/*
                'خاص بالعيادة' was a pill beside the title. It is a property of
                the whole card, which is what a title is for.
              */}
                  <CardTitle as="h2" icon="notes" size="sm">
                    {t('sections.privateNotes')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/*
                    One entry, merged: a record saved before the two note
                    fields became one can still hold text in both, and reading
                    them out as two labelled notes would put the split back on
                    screen after the dialog stopped drawing it.
                  */}
                  <Notes
                      items={[
                        {
                          label: t('intake.notesDivider'),
                          value: mergedNotes(intake.medicalNotes, intake.notes),
                        },
                      ]}
                    />
                </CardContent>
              </Card>
            ) : null}
          </div>
          ) : null}
      </div>
      ) : null}

      {/*
        The assessment sheet, read back in the order it was asked.

        Short closed answers first as a labelled lattice, prose under
        them: a marital status and a blood type are two words each, and
        running them as `Notes` entries gave every one of them a line of
        its own down a card that was mostly whitespace.

        **The two halves sit side by side, across the full width.** They are the
        one pair on this screen that is genuinely read together — who this person
        is, and how they live — and each is a short lattice of two-word answers,
        so stacked they were two wide cards of mostly empty row. They are out of
        the three-column grid above rather than inside its wide column: at half
        of two-thirds, a "نمط الحياة والعادات" lattice wraps to one answer per
        line, which is the shape this pairing exists to avoid.

        `items-start` so the shorter of the two keeps its own height instead of
        stretching to match, and one column below `sm`, where side by side would
        be two narrow strips.
      */}
      {hasAssessmentGrid ? (
      <div className="grid items-start gap-4 sm:grid-cols-2">
        {hasBackgroundRecord ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" icon="personOutline" size="sm">
              {t('intake.sections.background')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FactList items={backgroundFacts} />
            <Notes items={backgroundNotes} />
          </CardContent>
        </Card>
        ) : null}

        {hasHabitsRecord ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" icon="activityOutline" size="sm">
              {t('intake.sections.habits')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Notes items={habitNotes} />
            <FactList items={habitFacts} />
          </CardContent>
        </Card>
        ) : null}
      </div>
      ) : null}

      {/*
        Every gap, once, at the end — instead of a headed empty card per section.
        Dashed and unfilled: `Card variant="empty"` is the system's "a space
        waiting to be filled", which is exactly what this is. Each chip opens the
        same dialog, so a gap is one click from being closed.
      */}
      {gaps.length > 0 ? (
        <Card variant="empty" size="sm">
          <CardContent className="flex flex-col gap-3">
            {/*
              The 'إكمال البيانات' button is gone. Every chip below already
              opens the same dialog and each one names the field it will take
              you to, so the button was a fourth door to a room with three —
              counting the header's own control.
            */}
            <p className="text-body-md text-foreground">
              {/*
                The instruction leads and the count follows it, which is the
                reverse of how this read before. The chips are sections now
                rather than fields, so "# حقول بلا بيانات" no longer describes
                what is under it — it is the size of the job, not the name of
                it, and belongs in the muted half.
              */}
              {t('intake.gapsHeading')}
              {' — '}
              <span className="text-muted-foreground">
                {t('intake.gapsPrompt', { count: gaps.length })}
              </span>
            </p>

            <ul className="flex flex-wrap gap-2">
              {gapChips.map((chip) => (
                <li key={chip.key}>
                  {/*
                    `h-10`, the design system's floor for a control. These were
                    26px tall — below the smallest size the button scale admits,
                    on a target that is the whole point of the card.
                  */}
                  <IntakeFormTrigger
                    locale={locale}
                    clientId={intake.clientId}
                    section={chip.section}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-dashed border-input px-4 text-label text-muted-foreground transition-colors hover:border-solid hover:border-primary hover:bg-secondary hover:text-secondary-foreground"
                  >
                    <Icon name="edit" className="size-4" />
                    {chip.label}
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
 * Where this BMI actually falls, drawn as the four named categories.
 *
 * ⚠ **It used to highlight 'normal' no matter what the reading was.** The scale
 * was a `ComfortBand` — a track with one lime span marking the *comfortable*
 * range and a hairline marker for the value — which is exactly right for a
 * calorie target against its tolerance and exactly wrong here. The lime span sat
 * on 18.5–25 permanently, so the loudest thing on the scale said 'healthy' while
 * a client at BMI 51.9 was represented by a 3px tick clamped against the far
 * edge, easy to miss entirely. The chart answered 'where is normal?' when the
 * question is 'where is *this person*?'.
 *
 * Now the four categories are the track, and **the one the client is in is the
 * one that is filled** — in its own status colour, with its label emphasised to
 * match. Everything else is the sunken neutral. A reading in the obese range
 * produces a clay band and a clay label; nothing on the scale reads as
 * reassuring unless the value is.
 *
 * ⚠ **It was also missing a category outright.** `bmiCategory` returns five —
 * `obese` is 30–35 and `severely_obese` is 35 and up — and the scale drew four,
 * labelling everything past 30 'سمنة'. A client at BMI 51.9 was therefore shown
 * a category that was not the one the record had computed, which is the reading
 * that made this look broken. All five are drawn now, and the track runs to 45
 * so the most severe band is a band rather than the edge.
 *
 * A value past the end still clamps, but clamping no longer loses the meaning:
 * the filled segment and the emphasised label carry the category regardless of
 * where the marker sits.
 *
 * Segment widths and label columns come from the same `percent()`, so the labels
 * cannot drift out of the bands they name — they did, when the labels were four
 * equal quarters over four unequal ranges and `overweight` centred inside the
 * obese span.
 *
 * The two obesity bands are coloured apart because `BMI_CATEGORIES` splits them
 * apart: clay-100 for `obese`, the solid clay for `severely_obese`. Clay is the
 * system's only alarm colour and a clinical finding is what it is for.
 */
const BMI_TONES = {
  underweight: {
    fill: 'bg-status-attention-bg',
    text: 'text-status-attention-fg',
    mark: 'bg-status-attention-fg',
  },
  normal: {
    fill: 'bg-status-on-track-bg',
    text: 'text-status-on-track-fg',
    mark: 'bg-status-on-track-fg',
  },
  overweight: {
    fill: 'bg-status-attention-bg',
    text: 'text-status-attention-fg',
    mark: 'bg-status-attention-fg',
  },
  obese: {
    fill: 'bg-status-medical-bg',
    text: 'text-status-medical-fg',
    mark: 'bg-status-medical-fg',
  },
  severely_obese: {
    fill: 'bg-destructive',
    text: 'text-destructive',
    mark: 'bg-destructive',
  },
} as const satisfies Record<
  BmiCategory,
  { fill: string; text: string; mark: string }
>;

function BmiScale({
  bmi,
  category,
  label,
  valueText,
  scaleLabels,
}: {
  bmi: number;
  category: BmiCategory;
  label: string;
  valueText: string;
  scaleLabels: Record<BmiCategory, string>;
}) {
  /*
   * 15–45. It was 15–40, which put the `severely_obese` boundary (35) at 80% of
   * the track and left that category four fifths of the way along with nowhere
   * to sit. Widening by five points gives every band a share and still keeps
   * the healthy range a readable fifth of the width rather than a sliver.
   */
  const MIN = 15;
  const MAX = 45;
  const percent = (value: number) => ((value - MIN) / (MAX - MIN)) * 100;

  // The boundaries `bmiCategory` itself uses. Keep the two in step.
  const bounds = [percent(18.5), percent(25), percent(30), percent(35)];

  const segments = [
    { key: 'underweight', width: bounds[0]! },
    { key: 'normal', width: bounds[1]! - bounds[0]! },
    { key: 'overweight', width: bounds[2]! - bounds[1]! },
    { key: 'obese', width: bounds[3]! - bounds[2]! },
    { key: 'severely_obese', width: 100 - bounds[3]! },
  ] as const satisfies readonly { key: BmiCategory; width: number }[];

  const columns = segments.map((segment) => `${segment.width}fr`).join(' ');
  const marker = Math.min(100, Math.max(0, percent(bmi)));
  const tone = BMI_TONES[category];

  return (
    <div className="flex flex-col gap-2">
      <div
        role="meter"
        aria-valuenow={Number(bmi.toFixed(1))}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuetext={valueText}
        aria-label={label}
        className="relative"
      >
        {/*
          `gap-px` on a `bg-card` grid draws the dividers between segments as
          the card showing through, so the four bands read as one track cut into
          parts rather than as four separate bars.
        */}
        <div
          aria-hidden
          className="grid h-2 gap-px overflow-hidden rounded-full bg-card"
          style={{ gridTemplateColumns: columns }}
        >
          {segments.map((segment) => (
            <span
              key={segment.key}
              className={segment.key === category ? tone.fill : 'bg-muted'}
            />
          ))}
        </div>

        {/*
          Centred on its own position rather than anchored by an edge, so the
          mark straddles the reading instead of starting at it. Extends past the
          track vertically so it reads as a mark and not as another segment.
        */}
        <span
          aria-hidden
          className={cn('absolute -top-1 h-4 w-[3px] rounded-full', tone.mark)}
          style={{ insetInlineStart: `calc(${marker}% - 1.5px)` }}
        />
      </div>

      {/* One label per band — 18.5 / 25 / 30 / 35, the boundaries the record's
          own `bmiCategory` splits on. */}
      <div
        className="grid text-body-sm"
        style={{ gridTemplateColumns: columns }}
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={cn(
              'truncate px-1 text-center',
              segment.key === category
                ? cn('font-semibold', tone.text)
                : 'text-muted-foreground',
            )}
          >
            {scaleLabels[segment.key]}
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
 * The day's meals, in order, with their share of the target drawn under each.
 *
 * A schedule is a sequence, and it was being drawn as an unordered wrap of
 * hand-rolled `bg-muted` chips — not `Badge`, not a tile — with nothing to say
 * which meal came first or how much of the day each one carried.
 *
 * ⚠ **The share used to be the cell's width, and it cost the labels.** Taking
 * `flex-grow` from `kcalShare` made a 10% snack a tenth as wide as the row's
 * total, which on a five-meal day is far narrower than the word 'سناك صباحي' —
 * so the two snacks in a normal schedule both truncated to 'سناك…' and the
 * reader lost the one thing a schedule is for. Encoding a number in geometry is
 * only free when the geometry has room to spare.
 *
 * Every cell takes an equal share of the row with a floor under it, and the
 * share is stated as a figure instead of drawn.
 *
 * **Three lines, centred, and no bar.** The bar that briefly replaced the
 * width-encoding was the same idea one step quieter, and it still spent a row of
 * the cell on a quantity the '25%' beside the time already gives exactly. Five
 * cells each carrying a tiny partial rule read as a progress tracker, which a
 * meal plan is not. What is left is the glyph, the name and the timing — the
 * three things a dietitian scans a schedule for — stacked on the centre line so
 * the row reads as five equal parts of one day.
 *
 * An `<ol>`, because the order is the content. The row mirrors in Arabic for
 * free — a flex row follows the document direction, so the earliest meal starts
 * at the inline-start edge in both languages.
 */
function MealSchedule({
  slots,
}: {
  slots: {
    slotKey: string;
    label: string;
    timeOfDay: string;
    kcalShare: number;
  }[];
}) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row">
      {slots.map((slot) => (
        <li
          key={slot.slotKey}
          className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md bg-muted px-3 py-3 text-center sm:min-w-28 sm:basis-0"
        >
          <Icon
            name={MEAL_ICONS[mealTypeForSlot(slot.slotKey)]}
            className="size-[1.0625rem] shrink-0 text-muted-foreground"
          />
          <span
            className="max-w-full truncate text-body-md font-medium"
            dir="auto"
          >
            {slot.label}
          </span>
          {/* A clock time and a percentage — bare digits, so genuinely LTR. */}
          <span
            className="text-body-sm tabular-nums text-muted-foreground"
            dir="ltr"
          >
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
 *
 * ⚠ **`dir` goes on a `<bdi>` inside the value, never on the `<dd>` itself.**
 * A `dd` is a block, so `dir="auto"` on it resolved the *paragraph* direction
 * from the note's own first strong character — and with that came
 * `text-align: start`, which flipped. A Latin-script note in an Arabic record
 * therefore rendered hard against the opposite edge of the card from the Arabic
 * label naming it, a full card-width away, with nothing between them. `<bdi>`
 * isolates the run so mixed scripts still order correctly while the block stays
 * in the page's direction. Same trap as the phone number in `ClientProfilePanel`.
 */

/**
 * The six food-frequency answers, in the order the assessment asks them.
 *
 * Declared here rather than imported from the dialog: this is a server
 * component and `intake-form.tsx` is `'use client'`, so importing its constant
 * would pull the whole form into this module's graph to read six strings.
 */
const FREQUENCY_DISPLAY_FIELDS = [
  'caffeineFrequency',
  'fastFoodFrequency',
  'produceFrequency',
  'dairyFrequency',
  'proteinFoodFrequency',
  'sweetsFrequency',
] as const satisfies readonly (keyof ClientIntakeValues)[];

/**
 * Short label-over-value pairs, two or three across.
 *
 * `Notes` beneath it does the same job for prose and gives every entry a line
 * of the card; a blood type and a marital status are two words each, and eight
 * of them stacked was a column of whitespace with words down one edge. Blank
 * answers are dropped rather than drawn as an em dash — an assessment is filled
 * in across visits, and a lattice of placeholders reads as a form to complete
 * rather than a record to read.
 */
function FactList({ items }: { items: { label: string; value: string | null }[] }) {
  const present = items.filter((item) => item.value !== null && item.value !== '');
  if (present.length === 0) return null;

  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {present.map((item) => (
        <div key={item.label}>
          <dt className="text-label text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-body-md text-foreground [overflow-wrap:anywhere]">
            <bdi>{item.value}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Notes({
  items,
}: {
  items: { label: string; value: string | null; medical?: boolean }[];
}) {
  const present = items.filter(
    (item) => item.value !== null && item.value !== '',
  );
  if (present.length === 0) return null;

  return (
    <dl className="flex flex-col gap-3">
      {present.map((item) => (
        <div key={item.label}>
          <dt className="text-label text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              'mt-1 text-body-md whitespace-pre-line [overflow-wrap:anywhere]',
              item.medical
                ? 'font-semibold text-status-medical-fg'
                : 'text-foreground',
            )}
          >
            <bdi>{item.value}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}
