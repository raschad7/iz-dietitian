import { type ReactNode } from 'react';

import { useFormatter, useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DismissibleCallout } from '@/components/ui/dismissible-callout';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { Icon, type IconName } from '@/components/ui/icon';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { calculateAge } from '@/features/clients/age';
import { IntakeFormTrigger } from '@/features/clients/components/intake-form-trigger';
import { INTAKE_FIELD_COUNT, intakeGaps } from '@/features/clients/intake-gaps';
import { type IntakeSectionId } from '@/features/clients/intake-sections';
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
 * ## One headline, then a spine
 *
 * **القياسات is a card and stays open.** It is the headline of the record —
 * the six figures, where the BMI falls, the completeness meter, and the button
 * that writes all of it. Nothing about it is optional reading.
 *
 * **Everything under it is one column of six identical disclosure rows**, in a
 * fixed order that does not change from client to client: الحساسية, جدول
 * الوجبات, ما تلتزم به الخطة, بيانات ومعلومات عامة, نمط الحياة والعادات,
 * ملاحظات خاصة بالعيادة. Each row names its section and opens in place. See the
 * note above the spine for why that order and which rows open on arrival.
 *
 * ## What was wrong with rendering it all
 *
 * The record holds around forty label/value pairs. Every arrangement before this
 * one rendered all of them at once and tried to fix the result by *grouping*:
 * two columns, then three, then a wide stack beside a narrow one, then full-width
 * cards in a considered order. Every one of them was still forty answers on a
 * screen, with a blood type at the same visual weight as a drug allergy.
 *
 * Two things made it worse than dense. **The layout changed shape per client** —
 * cards were omitted when empty, so a three-column grid collapsed to one when a
 * stack emptied out and no two records looked alike; a reader could never learn
 * where anything was, only search for it each time. And **the safety-critical
 * section was in the narrowest column**, because it happened to be short.
 *
 * The spine answers both. Six rows, always the same six, always in the same
 * order, with the clinical one first and the twenty-one answers of the assessment
 * sheet closed behind a heading.
 *
 * ## What changed before that, and why
 *
 * **Three type sizes on one row.** Numeric facts were set at `heading-sm` with a
 * 12px unit beside them and non-numeric ones at `body-sm`, sharing a grid — so
 * '80 كغ', 'زيادة الوزن' and 'نشاط خفيف' sat in one row at three different sizes
 * with nothing aligned to anything. Every measurement is a `StatTile` now, which
 * is one size and one baseline by construction.
 *
 * **The BMI scale was a card of its own** — ring, shadow, title row and `gap-4`
 * around a single 8px rule. It is the second half of القياسات now, under a
 * hairline and a heading of its own; see the note where it is drawn.
 *
 * **The meal schedule led the record, at two-thirds width**, which opened on the
 * conclusion and did it in a column too narrow for five meal names.
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

  /*
   * Everything the clinical section holds, as one list — the allergens rolled
   * into a single line, then the written detail, the conditions, the drugs and
   * the drug reactions.
   *
   * It is an array rather than five separate flags because two things read it as
   * a whole: `recorded` below, which decides whether the section has anything in
   * it at all, and the row's own summary, which shows the allergens themselves.
   */
  const allergyItems = [
    {
      label: t('intake.allergyLine'),
      value:
        allergenTags.length > 0 || intake.customAllergens.length > 0
          ? format.list([
              ...allergenTags.map((tag) => t(`allergens.${tag}`)),
              ...intake.customAllergens,
            ])
          : null,
      medical: true,
    },
    { label: t('intake.allergyDetailLabel'), value: intake.allergies },
    { label: t('fields.conditions'), value: intake.conditions },
    { label: t('fields.medications'), value: intake.medications },
    { label: t('fields.drugAllergies'), value: intake.drugAllergies, medical: true },
  ];

  const planningItems = [
    { label: t('fields.permanentInstructions'), value: intake.permanentInstructions },
    { label: t('fields.preferences'), value: intake.preferences },
    { label: t('fields.dislikes'), value: intake.dislikes },
  ];

  /*
   * One entry, merged: a record saved before the two note fields became one can
   * still hold text in both, and reading them out as two labelled notes would
   * put the split back on screen after the dialog stopped drawing it.
   */
  const privateItems = [
    {
      label: t('intake.notesDivider'),
      value: mergedNotes(intake.medicalNotes, intake.notes),
    },
  ];

  /*
   * The assessment questionnaire, in the two halves the dialog writes it in.
   *
   * Two lists rather than one: the sheet is filled in across visits, so a
   * client can have answered the background questions and none of the habits
   * ones, and each section's row counts and opens for itself.
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

  const backgroundNotes = [
    { label: t('fields.visitReason'), value: intake.visitReason },
    { label: t('fields.dietHistory'), value: intake.dietHistory },
    { label: t('fields.familyHistory'), value: intake.familyHistory },
  ];

  /*
   * How this person lives, and what they eat how often — two blocks, not one
   * run of twelve answers.
   *
   * They used to be one `habitFacts` array with the two written answers hoisted
   * into a `Notes` stack above it, which put "مشي 30 دقيقة" on a line of its own
   * over a lattice of ten one-word frequencies. The written answers are the same
   * shape as the closed ones — a label and a short phrase — so they read as one
   * lattice; what genuinely divides the card is *subject*, and that is where the
   * rule goes.
   */
  const lifestyleFacts = [
    { label: t('fields.activityNotes'), value: intake.activityNotes },
    { label: t('fields.activityBarriers'), value: intake.activityBarriers },
    {
      label: t('fields.sleepHours'),
      value: intake.sleepHours !== null ? t('intake.hoursValue', { value: intake.sleepHours }) : null,
    },
    {
      label: t('fields.smoking'),
      value: isMember(SMOKING_HABITS, intake.smoking) ? t(`smoking.${intake.smoking}`) : null,
    },
  ];

  const frequencyFacts = FREQUENCY_DISPLAY_FIELDS.map((field) => ({
    label: t(`fields.${field}`),
    value: isMember(INTAKE_FREQUENCIES, intake[field]) ? t(`frequency.${intake[field]}`) : null,
  }));

  /*
   * One flag per *block*, not per card. A rule between two halves of a card is
   * only a divider when there is something on both sides of it; with one half
   * empty it is a line under the contents, which is what a card's own edge
   * already is.
   */
  /*
    ⚠ **Every section is drawn for every client, filled or not**, and these
    counts are what each row says about itself.

    This reverses the arrangement it replaced, where a section with nothing in
    it drew no card at all and one dashed card at the foot listed what was
    missing. That was the right trade when a section cost a headed, ringed card
    a third of a screen tall — seven of those saying "nothing here" is most of a
    screen spent on absence. It stops being the right trade now that a section
    costs **one 56px row**.

    What the old arrangement cost was the thing that made this record hard to
    read: its *shape changed from client to client*. Cards appeared and
    disappeared, a three-column grid collapsed to one when a stack emptied, and
    nothing was ever in the same place twice — so the record could not be
    learned, only searched. Six identical rows in a fixed order can be learned
    once and then navigated blind.

    The gap card is gone with it, and nothing is silently absent: an empty
    section says "لم تُسجَّل بعد" on its own row and opens the dialog on itself,
    which is what that card's chips did. The measurement fields it also covered
    are named by the `targets.missing` callout inside القياسات, and the meter in
    that card's header still counts the record whole.
  */
  const recorded = (items: readonly { value: string | null }[]) =>
    items.filter((item) => item.value !== null && item.value !== '').length;

  const backgroundCount = recorded(backgroundFacts) + recorded(backgroundNotes);
  const habitsCount = recorded(lifestyleFacts) + recorded(frequencyFacts);
  const allergyCount = recorded(allergyItems);
  const planningCount = recorded(planningItems);
  const privateCount = recorded(privateItems);

  const hasBackgroundFacts = recorded(backgroundFacts) > 0;
  const hasBackgroundNotes = recorded(backgroundNotes) > 0;
  const hasLifestyleRecord = recorded(lifestyleFacts) > 0;
  const hasFrequencyRecord = recorded(frequencyFacts) > 0;
  const hasScheduleRecord = intake.mealSchedule.length > 0;

  /**
   * What a closed row says about itself — **only when it has nothing to say.**
   *
   * A filled section's row now carries its name and nothing else. It used to
   * carry a tally as well — '14 إجابة', '7 إجابات' — on the reasoning that a
   * closed row should say whether it is worth opening. In practice the number
   * never answered that: a section with fourteen answers and one with seven are
   * equally worth opening, the count changes with a field the dietitian filled
   * in months ago, and six rows each ending in a different numeral turned a
   * clean spine into a column of arithmetic.
   *
   * "Not recorded yet" survives because it is not a count — it is the one thing
   * a closed row can say that saves the reader the click, and without it an
   * empty section and a full one are the same row.
   *
   * `undefined` rather than an empty string: `Disclosure` renders no summary
   * element at all for it, so the row is genuinely title-and-chevron.
   */
  const emptySummary = (count: number) =>
    count > 0 ? undefined : t('intake.sectionEmpty');

  return (
    /*
      `gap-3` rather than `gap-4`. A stack of six closed 56px rows wants less air
      between them than a stack of tall cards did: at 16px the gaps were reading
      as loudly as the rows, and a spine you are meant to scan down should look
      like a list rather than like six unrelated objects that happen to be
      stacked.
    */
    <div className="flex flex-col gap-3">
      {/*
        The meter lives in the header of the card it describes. It used to be a
        card of its own — no title, no heading, floating above four cards that
        all had both — and it carried an `تعديل` button directly under the
        header's own `تعديل`: two identical labels a few pixels apart opening
        two different dialogs. This one names its object.
      */}
      <Card>
        {/*
          ⚠ **No `flex-row` override on this header.** It carried
          `flex-row flex-wrap items-center justify-between`, which replaced
          `CardHeader`'s own grid with a wrapping flex row — and a wrapping row
          is exactly what it sounds like: as soon as the title, the meter, the
          count and the button did not fit, the whole action group dropped to a
          second line and the card opened with a heading alone above a stranded
          row of controls.

          The header is a grid built for this. `has-data-[slot=card-action]`
          gives it `grid-cols-[1fr_auto]`, and `CardAction` is
          `col-start-2 row-span-2 row-start-1 justify-self-end` — the title takes
          the free column, the controls take exactly what they need at the
          inline-end of the *same* line, and the description slides underneath
          the title rather than pushing anything down.
        */}
        <CardHeader>
          <CardTitle as="h2" icon="progress" size="sm">
            {t('intake.sections.measurements')}
          </CardTitle>

          {/*
            `justify-end` and `flex-wrap`: one line is what this is for, and on a
            phone the button plus the meter genuinely cannot share a 360px row
            with the title — so they wrap *within their own column*, at the
            inline-end, rather than dragging the whole group under the heading.
          */}
          <CardAction className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {/*
              **No word in front of the meter.** It read "مكتمل" at every width
              from `sm` up, which is the label of a reading that already reads as
              one: a filled track with 11/11 beside it says "complete" without
              being told, and on a partial record the word was saying the exact
              opposite of what the bar showed.

              The meter is still named for a screen reader — see `aria-label` and
              `aria-valuetext` below — which is where that word was actually
              doing work.
            */}
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
          </CardAction>
        </CardHeader>

        {/*
          `pt-2` on top of the card's own `gap-(--card-spacing)`.

          The gap alone was measured from the *title*, and this header is not as
          tall as its title: `CardAction` puts a 40px button on the same line, so
          the row's real bottom edge is the button's, and the grid was sitting
          eight pixels under a control instead of twenty under a heading. The
          card's gap is right for every other card and wrong for this one because
          this one has a button in its header — so the correction belongs here,
          not on the shared token.
        */}
        <CardContent className="flex flex-col gap-4 pt-2">
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

          {/*
            ⚠ **The one callout on this screen that can be closed**, and the
            `noticeId` is what makes that safe: it carries the client *and both
            figures*, so closing "1500 against 2868" says nothing about "1200
            against 2868" — change either number and the warning is back.

            It is dismissible because it is the only notice here that can be
            *correct and unwanted at the same time*. A dietitian who has set a
            manual target deliberately has already answered this question, and
            the record can hold that state for months; the missing-fields
            callout above cannot be answered by reading it, so it stays.
          */}
          {kcalMismatch ? (
            <DismissibleCallout
              tone="attention"
              title={t('intake.kcalMismatch')}
              noticeId={`kcal-mismatch:${intake.clientId}:${kcalMismatch.manual}:${kcalMismatch.computed}`}
              dismissLabel={t('intake.dismissWarning')}
            >
              {t('intake.kcalMismatchDetail', {
                manual: kcalMismatch.manual,
                computed: kcalMismatch.computed,
              })}
            </DismissibleCallout>
          ) : null}

          {/*
            No `note` on any tile. 'محسوب' / 'مقترح' said where a number came
            from, and 'فوق النطاق الصحي' repeated in words the band drawn
            immediately below it. A reading is a label and a figure.
          */}
          {/*
            ⚠ **Eight tiles in four columns, and the two rows mean different
            things.** The first is what was *measured* — height, weight, age, and
            the BMI derived from them. The second is what the plan is *set to* —
            the goal, the activity level, and the daily calorie and protein
            targets those two produce. Reading down a column is meaningless;
            reading across a row is the point, and four-up is what makes the rows
            visible as rows. Six columns put all of it on one undifferentiated
            strip.

            **الهدف and النشاط are tiles here rather than a line of prose above
            the grid.** They have now been in three places: a muted sentence at
            the top of the card content, then the card's description under the
            title. Both had the same fault — two facts of exactly the same shape
            as the six below them, a label and a short value, set in a different
            size and a different treatment because they happen to be words
            instead of digits. That is precisely the row of three type sizes
            `StatTile` was built to end (see the note at the top of
            `stat-tile.tsx`); `textual` is what lets a worded value into the grid
            without taking `dir="ltr"` and `tabular-nums` with it.

            A null goal now draws an em dash in its own cell rather than removing
            a sentence, which is the same answer every other unrecorded reading
            on this grid gives.

            ⚠ **الهدف is also on the identity panel**, as the pill under the
            client's name, so this repeats it. It stays because that pill is
            conditional — an archived client shows the archived badge *instead*
            of the goal (see `ClientProfilePanel`) — and the one card that
            computes a calorie target from the goal should not be the card that
            stops naming it.
          */}
          <StatGrid columns={4}>
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

            <StatTile textual label={t('intake.goalLine')} value={goalLabel} />
            <StatTile textual label={t('intake.activityLine')} value={activityLabel} />
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

          {/*
            ⚠ **The scale is the second half of this card, not a card of its
            own** — and the thing that makes that work is the heading, which it
            did not have the first time it lived here.

            It was moved out because inside the measurements card it read as a
            footer to the six figures: an unlabelled rule under a grid, close
            enough to the tiles to look like part of the same object, and the
            only element on that card with no name of its own. All of that was
            true, and none of it was an argument for a second card — it was an
            argument for a name. A card whose title is 'مؤشر كتلة الجسم' and
            whose entire contents are one 8px rule spends a whole surface, a
            title row and a `gap-4` on a single line of chart.

            The measurements and where they fall are one subject. The tiles say
            what the numbers *are* and this says where this person *sits*, which
            is the reading a dietitian acts on — and the second question is only
            worth asking because of the first. A rule and a label divide them;
            they do not need a gap and a ring to do it.

            `Section` names it without competing with the card's own `h2`. A
            bare 27.4 still means nothing to most readers; against the named
            bands it means 'a little over'. See `BmiScale` for why this is no
            longer a `ComfortBand`.
          */}
          {targets.bmi !== null && targets.bmiCategory ? (
            <Section icon="trend" title={t('intake.bmiScale')}>
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
            </Section>
          ) : null}
        </CardContent>
      </Card>

      {/*
        ⚠ **The spine: six rows, the same six for every client, in this order.**

        The order is the argument, and it is not the order the intake dialog
        writes them in. It is roughly "what would change what I do next":

        1. **الحساسية والبيانات الطبية** — what must not be prescribed. It was in
           a one-third column beside the schedule, which put the only
           safety-critical section on the record in the narrowest box on it.
        2. **جدول الوجبات** — the shape of the day being prescribed.
        3. **ما تلتزم به الخطة** — the standing instructions that shape it.
        4. **بيانات ومعلومات عامة** and 5. **نمط الحياة والعادات** — the
           assessment sheet. Twenty-one answers between them, and the two
           sections a dietitian opens least often, which is exactly why they
           start closed.
        6. **ملاحظات خاصة بالعيادة** — the clinic's own note.

        **Which ones open on arrival is an editorial judgement**, and it is the
        whole point of the change. A record that renders all forty answers at
        once is not organised by rendering them in tidier boxes — it is still
        forty answers. The first four rows open when they hold something,
        because they are what a dietitian came for; the assessment sheet stays
        shut and says how much is in it, because it is reference material.

        One column, not the three-column grid this replaced. That grid put a
        section's *width* at the mercy of whether its neighbour happened to be
        filled in, so no two clients' records looked alike. A row is a row.
      */}

      <Disclosure
        icon="medical"
        title={t('intake.sections.allergies')}
        defaultOpen={allergyCount > 0}
        /*
          ⚠ **The allergens themselves used to be printed on this row**, in clay,
          so the record read as a warning from across the screen without being
          opened. That was the strongest argument any summary had, and it is
          gone with the rest of them: every row on this spine now carries its
          name and nothing else, and one row breaking that pattern is the row a
          reader stops trusting the pattern over.

          The safety net is that this section is the first on the spine and
          `defaultOpen` whenever it holds anything — so the allergens are on
          screen when the tab opens, which is what actually mattered. They are
          one line down instead of on the header.
        */
        summary={emptySummary(allergyCount)}
      >
        {allergyCount > 0 ? (
          /*
            The allergens are a labelled line in the same list as the rest of the
            clinical record, not a row of pills above it. They read in clay,
            which is what marks a medical fact — a pill added a filled shape
            around information that was already the loudest thing on the card.
            The catalog/free-text distinction the filled and outlined pills used
            to draw is the intake dialog's job; on a read-only card it was a
            legend nobody had.
          */
          <Notes items={allergyItems} />
        ) : (
          <SectionEmpty locale={locale} clientId={intake.clientId} section="allergies" label={t('intake.fillSection')} />
        )}
      </Disclosure>

      <Disclosure
        icon="clock"
        title={t('intake.sections.schedule')}
        defaultOpen={hasScheduleRecord}
        summary={hasScheduleRecord ? undefined : t('intake.sectionEmpty')}
      >
        {hasScheduleRecord ? (
          <MealSchedule slots={intake.mealSchedule} />
        ) : (
          <SectionEmpty locale={locale} clientId={intake.clientId} section="schedule" label={t('intake.fillSection')} />
        )}
      </Disclosure>

      <Disclosure
        icon="weeklyPlans"
        title={t('intake.sections.planning')}
        defaultOpen={planningCount > 0}
        summary={emptySummary(planningCount)}
      >
        {planningCount > 0 ? (
          <Notes items={planningItems} />
        ) : (
          <SectionEmpty locale={locale} clientId={intake.clientId} section="planning" label={t('intake.fillSection')} />
        )}
      </Disclosure>

      {/*
        Closed on arrival even when full — see the spine note above. Twelve
        answers about somebody's household and their reason for coming are worth
        keeping and are not worth opening a record to.
      */}
      <Disclosure
        icon="personOutline"
        title={t('intake.sections.background')}
        summary={emptySummary(backgroundCount)}
      >
        {backgroundCount > 0 ? (
          <div className="flex flex-col gap-4">
            <FactList items={backgroundFacts} columns={4} />
            {hasBackgroundFacts && hasBackgroundNotes ? <Rule /> : null}
            {/*
              Three across rather than one per line. `visitReason`,
              `dietHistory` and `familyHistory` are answers to questions —
              'انقاص وزن', 'كيتو لمدة شهرين' — not paragraphs, and giving each of
              them the full width of the card made three short phrases occupy
              three whole rows. A long one still wraps inside its own column.
            */}
            <Notes items={backgroundNotes} columns={3} />
          </div>
        ) : (
          <SectionEmpty locale={locale} clientId={intake.clientId} section="background" label={t('intake.fillSection')} />
        )}
      </Disclosure>

      <Disclosure
        icon="activityOutline"
        title={t('intake.sections.habits')}
        summary={emptySummary(habitsCount)}
      >
        {habitsCount > 0 ? (
          <div className="flex flex-col gap-4">
            <FactList items={lifestyleFacts} columns={4} />
            {/*
              The ten frequencies get a name of their own. They are one question
              asked ten times — "how often do you eat this" — and unlabelled
              under the sleep and smoking answers they read as the same list
              continuing, which is what made this section feel like a form
              dumped onto a page.
            */}
            {hasFrequencyRecord ? (
              <Section
                icon="leaf"
                title={t('intake.foodFrequency')}
                divided={hasLifestyleRecord}
              >
                <FactList items={frequencyFacts} columns={4} />
              </Section>
            ) : null}
          </div>
        ) : (
          <SectionEmpty locale={locale} clientId={intake.clientId} section="habits" label={t('intake.fillSection')} />
        )}
      </Disclosure>

      <Disclosure
        icon="notes"
        title={t('sections.privateNotes')}
        defaultOpen={privateCount > 0}
        summary={emptySummary(privateCount)}
      >
        {privateCount > 0 ? (
          /*
            ⚠ **The note sits in a tile, not loose on the section.** This is the
            one thing on the record written *by* the clinic rather than
            collected from the client, and set as plain text under a heading it
            looked exactly like the medical answers two rows above it. The muted
            fill marks it as a quotation from somebody's own hand.

            `Card variant="tile"` and not a default card: a nested surface takes
            the muted fill and drops the ring and shadow, which is the design
            system's rule against card-inside-card.
          */
          <Card variant="tile">
            <Notes items={privateItems} />
          </Card>
        ) : (
          <SectionEmpty locale={locale} clientId={intake.clientId} section="clinical" label={t('intake.fillSection')} />
        )}
      </Disclosure>
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
 * apart: --red-tint for `obese`, the solid red for `severely_obese`. Red is the
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
 * The ten food-frequency answers, in the order the assessment asks them.
 *
 * ⚠ **Kept in step with `FREQUENCY_FIELDS` in `intake-form.tsx` by hand.** The
 * two lists are the same ten keys in the same order, and they are two lists
 * because this is a server component while the form is `'use client'` —
 * importing its constant would pull the whole form into this module's graph to
 * read ten strings. A field added to one and not the other is written by the
 * dialog and never displayed here.
 */
const FREQUENCY_DISPLAY_FIELDS = [
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
/**
 * How many answers a lattice puts on a row from `sm` up. Below that every
 * lattice on this screen is one across: a label over a value is already two
 * lines, and two of them side by side on a phone wraps both.
 *
 * Written out rather than interpolated: Tailwind reads the source for class
 * names, and `sm:grid-cols-${n}` is a string it never sees.
 */
const LATTICE_COLUMNS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
} as const;

type LatticeColumns = keyof typeof LATTICE_COLUMNS;

/**
 * What a section with nothing in it holds: the way to put something in it.
 *
 * This is the dashed chip the gap card at the foot of the record used to draw,
 * one per missing section, moved to the section it names. It was the right
 * control in the wrong place — a list of what is missing, kept somewhere other
 * than where the missing thing goes, so closing a gap meant reading the foot of
 * the page and then finding your way back up.
 *
 * `h-10`, the design system's floor for a control. These were 26px once — below
 * the smallest size the button scale admits, on a target that is the entire
 * point of the row it sits in.
 */
function SectionEmpty({
  locale,
  clientId,
  section,
  label,
}: {
  locale: Locale;
  clientId: string;
  section: IntakeSectionId;
  label: string;
}) {
  return (
    <IntakeFormTrigger
      locale={locale}
      clientId={clientId}
      section={section}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-dashed border-input px-4 text-label text-muted-foreground transition-colors hover:border-solid hover:border-primary hover:bg-secondary hover:text-secondary-foreground"
    >
      <Icon name="add" className="size-4" />
      {label}
    </IntakeFormTrigger>
  );
}

/**
 * A named part of a card, under a hairline.
 *
 * The record has three places where one card genuinely holds two subjects — the
 * measurements and where they fall on the BMI scale, the lifestyle answers and
 * the food frequencies — and before this each of them was either a second card
 * with a title row and a ring around one line of content, or an unlabelled block
 * that read as the list above it continuing.
 *
 * A rule and a `text-label` heading is the whole treatment. It is quieter than
 * `CardTitle size="sm"` on purpose: this names a part, and a part that shouts as
 * loudly as the card it is inside makes the reader ask which of the two is the
 * real heading.
 *
 * `divided` is false for a part with nothing above it — the rule separates two
 * things, and drawn under the card header alone it is a line the card's own edge
 * already provides.
 */
function Section({
  icon,
  title,
  divided = true,
  children,
}: {
  icon: IconName;
  title: string;
  divided?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-3', divided && 'border-t border-border pt-4')}>
      <h3 className="flex items-center gap-2 text-label text-muted-foreground">
        <Icon name={icon} className="size-4 shrink-0" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The same hairline with nothing named on either side of it — for a card whose
 * two halves are obviously different in kind and need no telling apart, such as
 * the closed answers and the written ones in بيانات ومعلومات عامة.
 */
function Rule() {
  return <div aria-hidden className="h-px bg-border" />;
}

function FactList({
  items,
  columns = 3,
}: {
  items: { label: string; value: string | null }[];
  columns?: LatticeColumns;
}) {
  const present = items.filter((item) => item.value !== null && item.value !== '');
  if (present.length === 0) return null;

  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3', LATTICE_COLUMNS[columns])}>
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
  columns,
}: {
  items: { label: string; value: string | null; medical?: boolean }[];
  /**
   * Lay the notes out as a lattice instead of a stack.
   *
   * Omitted — the default — every note takes a line of the card, which is what
   * prose needs: standing instructions and an allergy description run to
   * sentences, and a sentence in a third of a card wraps to five lines.
   *
   * Passed, the notes share rows. Only for a set that is short by nature — the
   * three background answers are 'انقاص وزن', 'كيتو لمدة شهرين', 'سكري لدى الاب'
   * — where a line each is three rows of mostly empty card. A long value still
   * wraps inside its own column rather than breaking the grid.
   */
  columns?: LatticeColumns;
}) {
  const present = items.filter(
    (item) => item.value !== null && item.value !== '',
  );
  if (present.length === 0) return null;

  return (
    <dl
      className={cn(
        columns
          ? cn('grid grid-cols-1 gap-x-6 gap-y-3', LATTICE_COLUMNS[columns])
          : 'flex flex-col gap-3',
      )}
    >
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
