import { z } from 'zod';

import { defaultLocale, locales } from '@/i18n/routing';
import { type FitRowsBounds } from '@/lib/fit-rows';
import { isIsoDate, toIsoDate } from '@/lib/iso-date';
import { splitPhone } from '@/lib/phone-format';

import { calculateAge } from './age';
import {
  HEIGHT_CM_RANGE,
  MAX_AGE,
  MAX_NAME_PART_LENGTH,
  MAX_PHONE_DIGITS,
  MIN_AGE,
  WEIGHT_KG_RANGE,
} from './form-rules';
import { joinName } from './name';
import {
  ALLERGENS,
  BLOOD_TYPES,
  CLIENT_MARITAL_STATUSES,
  INTAKE_FREQUENCIES,
  mealScheduleSchema,
  SMOKING_HABITS,
} from './nutrition';

/**
 * Allowed values for the enum-like text columns. These live here rather than in
 * the database so extending them is a code change, not a migration.
 */
export const CLIENT_STATUSES = ['active', 'archived'] as const;
export const CLIENT_SEXES = ['female', 'male'] as const;
export const CLIENT_GOALS = [
  'weight_loss',
  'weight_gain',
  'maintenance',
  'medical',
  'sports',
] as const;
export const CLIENT_ACTIVITY_LEVELS = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type ClientSex = (typeof CLIENT_SEXES)[number];
export type ClientGoal = (typeof CLIENT_GOALS)[number];
export type ClientActivityLevel = (typeof CLIENT_ACTIVITY_LEVELS)[number];

/**
 * An untouched optional input arrives from FormData as `''`, which is not the
 * same thing as "not provided". Every optional field passes through here first.
 */
/**
 * `null` is what `FormData.get` returns for a field that never submitted
 * anything at all — an unchecked radio group, unlike a text input, does not
 * even send an empty string. Treated the same as a blank one: neither is a
 * value, both mean "not answered".
 */
function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function optionalText(max: number) {
  return z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
}

function optionalEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(blankToUndefined, z.enum(values).optional());
}

/**
 * The mirror of {@link blankToUndefined}, for the fields a client record cannot
 * be created without.
 *
 * A required field has to tell an empty one apart from an absent one *and treat
 * them the same*: an untouched text input submits `''`, an unchecked radio group
 * submits nothing at all, and both mean "not answered". Collapsing them to `''`
 * here rather than to `undefined` is what makes the failure a `required` message
 * on the field instead of Zod's own "invalid input" on a missing key.
 */
function blankToEmpty(value: unknown): unknown {
  return value === null || value === undefined ? '' : value;
}

/**
 * ⚠ Every message below is a **key**, not a sentence — see `VALIDATION_KEYS` in
 * `./form-rules.ts`, which is also where the two length limits live and why.
 * A new message here needs a matching entry there and in both message
 * catalogues, or the card renders nothing where the complaint should be.
 */

/**
 * The number as the form submits it: `+<calling code><digits>`.
 *
 * The shape is guaranteed by `PhoneField`, which recombines its two halves
 * through `joinPhone` — so this is not asking a person to type a format, it is
 * refusing to store anything that did not come from that control. Free text is
 * rejected outright rather than stripped: silently rewriting a patient's number
 * is the one outcome worse than an error message.
 *
 * ⚠ The length is measured on the **national part**, read back out with
 * `splitPhone`. A flat cap on the whole string would spend four of its
 * characters on `+1876` and leave a Jamaican number six digits shorter than a
 * Palestinian one.
 */
export const clientPhoneSchema = z
  .string()
  .trim()
  .min(1, 'required')
  .regex(/^\+\d+$/, 'phoneDigitsOnly')
  .refine((value) => splitPhone(value).national.length > 0, 'required')
  .refine((value) => splitPhone(value).national.length <= MAX_PHONE_DIGITS, 'phoneTooLong');

/**
 * Which end of the age range a date of birth falls outside, if either.
 *
 * ⚠ **The one rule in this file that reads a clock.** Elsewhere the convention is
 * that a schema has no clock — see the note on `calendarSearchSchema`, which
 * makes its caller resolve "today". That rule is about *defaulting*, where a
 * schema inventing a date would hide which day the value came from. This is
 * validation, and "is this person between ten and a hundred" cannot be answered
 * without knowing when now is. `calculateAge` takes an injectable `today` so the
 * arithmetic stays testable; this calls it with the default, because the question
 * is about the moment the form was submitted.
 *
 * ⚠ `calculateAge` returns `null` for both a **negative** age and one past 130 —
 * it refuses to believe either — so a null cannot simply pass this check or a
 * date of birth in the future would be accepted. Which end it belongs to is
 * decided from the date itself: later than today is too young, anything else is
 * too old. Without that split, the commonest real mistake on this field — a year
 * typed as this one — would sail through both bounds.
 */
function ageVerdict(dateOfBirth: string): 'tooYoung' | 'tooOld' | 'ok' {
  const age = calculateAge(dateOfBirth);

  if (age === null) return dateOfBirth > toIsoDate(new Date()) ? 'tooYoung' : 'tooOld';
  if (age < MIN_AGE) return 'tooYoung';
  if (age > MAX_AGE) return 'tooOld';

  return 'ok';
}

/**
 * One half of a client's name.
 *
 * Both halves are required and both are capped at {@link MAX_NAME_PART_LENGTH}.
 * They are joined into the single `clients.fullName` column on the way out —
 * see `./name.ts` for why the column did not become two.
 */
function namePartSchema(tooLongKey: 'firstNameTooLong' | 'lastNameTooLong') {
  return z.preprocess(
    blankToEmpty,
    z.string().trim().min(1, 'required').max(MAX_NAME_PART_LENGTH, tooLongKey),
  );
}

export const clientIdSchema = z.uuid();

export const localeSchema = z.enum(locales).catch(defaultLocale);

/**
 * The client card — who this person is, and how to reach them.
 *
 * Identity only, and that is the whole point. The clinical half of a client
 * record used to live behind a disclosure on this same card while the rest of
 * it lived on a form owned by the weekly planner, so neither surface held a
 * whole client and the calorie formula's six inputs were split across both. All
 * of it is {@link intakeSchema} now, and this card is what a walk-in is created
 * from in one short screen.
 *
 * `dateOfBirth` and `sex` stay here rather than moving with the rest: they are
 * demographics, they do not change, and Mifflin-St Jeor is unanswerable without
 * them — see `suggestTargets` in `src/features/weekly-plans/targets.ts`.
 *
 * ⚠ **Everything except the email is required**, which is a deliberate reversal:
 * the card used to accept a client with nothing but a name. The four fields it
 * now insists on are the four this schema's own docblock already called
 * load-bearing — a record without a date of birth or a sex cannot have its
 * calorie target computed, and one without a number cannot be sent a reminder.
 * Making them optional meant every one of those was discovered later, on a
 * different screen, by whoever needed the answer rather than by whoever had the
 * client in front of them.
 *
 * ⚠ The **intake stays optional to the last field** and must not follow this.
 * The two forms are different promises: an intake is worked through across
 * several visits, so a form that refuses to save an incomplete one loses what
 * had already been typed. This card is filled in once, at the counter, with the
 * person standing there.
 */
export const clientFormObject = z.object({
  firstName: namePartSchema('firstNameTooLong'),
  lastName: namePartSchema('lastNameTooLong'),
  phone: z.preprocess(blankToEmpty, clientPhoneSchema),
  /**
   * The one field that stays optional — and the only one with no control left
   * on the card, which is why it is also the only one that must keep tolerating
   * an absent value. See the ⚠ in `ClientIdentityFields` about the column.
   *
   * `.pipe()`, not `z.email().trim()`. In Zod 4 `z.email()` bakes its format
   * check in at construction, so a chained `.trim()` runs only AFTER validation
   * — and "  a@b.co " is rejected before anything gets a chance to trim it.
   * Normalise as a plain string first, then validate the result.
   */
  email: z.preprocess(
    blankToUndefined,
    z.string().trim().toLowerCase().pipe(z.email('invalidEmail')).optional(),
  ),
  preferredLocale: localeSchema,
  /**
   * A real calendar day, not merely a `YYYY-MM-DD`-shaped string.
   *
   * The regex this replaces accepted `2026-02-30`, which PostgreSQL then
   * rejected as a 500 rather than as a message on the field. `isIsoDate` is the
   * check the calendar already books against, so the two dates in this app now
   * agree about which ones exist.
   */
  dateOfBirth: z.preprocess(
    blankToEmpty,
    z
      .string()
      .trim()
      .min(1, 'required')
      .refine(isIsoDate, 'invalidDate')
      /*
        The two ends of the age range, reported separately: a date is too young
        or it is too old, and telling someone "between 10 and 100" makes them
        work out which mistake they made from a number they can already see.
      */
      .refine((value) => ageVerdict(value) !== 'tooYoung', 'ageTooYoung')
      .refine((value) => ageVerdict(value) !== 'tooOld', 'ageTooOld'),
  ),
  sex: z.preprocess(blankToEmpty, z.enum(CLIENT_SEXES, { error: 'required' })),
});

/**
 * The card's payload, with the stored name derived from the two fields.
 *
 * The object above is exported separately because `.pick()` is unavailable once
 * a schema carries a transform, and the calendar's walk-in dialog picks from it
 * — see `newClientSchema` in `src/features/booking/schema.ts`. Everything
 * downstream of this schema goes on reading `fullName` and never learns that
 * the form asked twice.
 */
export const clientFormSchema = clientFormObject.transform((values) => ({
  ...values,
  fullName: joinName(values.firstName, values.lastName),
}));

export type ClientFormInput = z.infer<typeof clientFormSchema>;

/**
 * The intake form — everything clinical about one client, from both tables.
 *
 * One schema over two tables on purpose. `clients` holds the columns the rest
 * of the app already reads (height, goal, the portal-visible prose) and
 * `client_nutrition_profiles` holds the ones only planning needs (weight, the
 * allergen tags, the schedule). That storage split is fine and stays. What was
 * wrong was asking a dietitian to know about it: they are filling in one
 * person, so they submit one form, and `saveIntake` fans it out.
 *
 * Every field is optional except the schedule. An intake is filled in over
 * several visits — a client can exist before they have been weighed — and a
 * form that refuses to save until it is complete is a form that loses the half
 * someone had already typed. Completeness is reported by `suggestTargets`,
 * which names what is missing rather than blocking the save.
 */
export const intakeSchema = z.object({
  clientId: clientIdSchema,

  /*
    ── Measurements, from `clients` ─────────────────────────────────────────

    ⚠ **These four are the exception to "the intake is optional to the last
    field"** — see the note on the schema above, which still holds for every
    other field here. They are required because they are the four inputs
    Mifflin-St Jeor needs alongside the card's date of birth and sex, so an
    intake missing any of them cannot produce the calorie target that gates
    plan generation.

    ⚠ It is **one form with one submit** across five panels. A required field
    here therefore blocks a save made from the Allergies panel too — the
    dietitian is switched to Measurements and told what is missing (see the
    section-switching note below). That is the cost of the rule, and it is why
    the rest of the intake must not follow.

    `blankToUndefined` rather than `blankToEmpty` for the numbers: `z.coerce.number`
    reads `''` as `0`, which would fail the lower bound and report a range error
    for a field nobody had touched. Mapped to `undefined` instead, the coercion
    fails outright and says `required`.
  */
  heightCm: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: 'required' })
      .int('heightOutOfRange')
      .min(HEIGHT_CM_RANGE.min, 'heightOutOfRange')
      .max(HEIGHT_CM_RANGE.max, 'heightOutOfRange'),
  ),
  goal: z.preprocess(blankToEmpty, z.enum(CLIENT_GOALS, { error: 'required' })),
  activityLevel: z.preprocess(blankToEmpty, z.enum(CLIENT_ACTIVITY_LEVELS, { error: 'required' })),

  /**
   * Current weight, from `client_nutrition_profiles`.
   *
   * The generous range still catches a slipped decimal: 500 kg is not a client,
   * it is a typo. One value and not a history — a weight log with a trend chart
   * is a feature of its own and nobody has asked for it yet.
   */
  weightKg: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: 'required' })
      .min(WEIGHT_KG_RANGE.min, 'weightOutOfRange')
      .max(WEIGHT_KG_RANGE.max, 'weightOutOfRange'),
  ),

  // ── Allergies: the tags filter, the prose does not ───────────────────────
  /**
   * The structured list — the only thing the dish catalog filters on. A
   * `FormData` with one ticked box yields a string rather than an array, which
   * is why this coerces before parsing.
   */
  allergenTags: z.preprocess(
    (value) =>
      value === undefined || value === null ? [] : Array.isArray(value) ? value : [value],
    z.array(z.enum(ALLERGENS)),
  ),
  /**
   * Allergens typed by hand, which do **not** filter the catalog.
   *
   * Trimmed, de-duplicated case-insensitively and capped, because these are
   * chips a person types and the same word twice is a mistake rather than a
   * meaning. Kept well away from `allergenTags`: see the column comment on
   * `client_nutrition_profiles.custom_allergens` for why that separation is the
   * safety property, not a modelling preference.
   */
  customAllergens: z.preprocess(
    (value) => {
      const list =
        value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

      const seen = new Set<string>();

      return list
        .map((entry) => String(entry).trim())
        .filter((entry) => {
          if (entry === '' || seen.has(entry.toLowerCase())) return false;
          seen.add(entry.toLowerCase());
          return true;
        });
    },
    z.array(z.string().min(1).max(40)).max(20),
  ),

  /** The detail behind the ticks — "mild reaction to walnuts, not almonds". */
  allergies: optionalText(1000),

  // ── Clinical record, from `clients`. The first two are portal-visible ────
  conditions: optionalText(1000),
  medications: optionalText(1000),
  /**
   * The dietitian's own working notes. Never shown to the client.
   *
   * 4000 rather than 2000: this field absorbed `notes`, so a record that held
   * two full boxes has to be saveable as one. `notes` stays in the schema so a
   * form that still submits it validates, and is written empty — see
   * `mergedNotes`.
   */
  medicalNotes: optionalText(4000),
  notes: optionalText(2000),

  // ── What generation reads, from `client_nutrition_profiles` ──────────────
  dailyKcalTarget: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(800).max(6000).optional(),
  ),
  proteinTargetGrams: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(20).max(400).optional(),
  ),
  preferences: optionalText(1000),
  dislikes: optionalText(1000),
  permanentInstructions: optionalText(2000),

  // ── The nutrition assessment questionnaire ───────────────────────────────
  /*
   * The clinic's paper form, in the dialog that already writes everything else
   * clinical. Optional to the last field, like the rest of the intake: the sheet
   * is worked through across visits, and a form that refuses to save an
   * incomplete one is a form that loses what had already been typed.
   */
  maritalStatus: optionalEnum(CLIENT_MARITAL_STATUSES),
  /**
   * Not a checkbox plus a number. "Has children" is answerable by the count
   * alone, and 0 is a different answer from a blank — one says none, the other
   * says nobody asked.
   */
  childrenCount: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(20).optional()),
  bloodType: optionalEnum(BLOOD_TYPES),
  occupation: optionalText(120),

  visitReason: optionalText(1000),
  dietHistory: optionalText(1000),
  /** Drug allergies — deliberately not folded into the food allergen fields. */
  drugAllergies: optionalText(1000),
  familyHistory: optionalText(1000),

  activityNotes: optionalText(1000),
  activityBarriers: optionalText(1000),
  /**
   * A night, in hours. Halves allowed — "six and a half" is how people answer —
   * and capped at 16, past which the answer is a typo rather than a sleeper.
   */
  sleepHours: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(16).optional()),
  smoking: optionalEnum(SMOKING_HABITS),

  /*
    One question per food. Caffeine and sweetened drinks were a single answer,
    as were beef, chicken and fish — see the ⚠ on the columns in
    `db/schema/client-nutrition-profiles.ts`. Every one of them takes the same
    five-point scale, which is what makes the split free: no new vocabulary, just
    the question asked once per thing it was about.
  */
  caffeineFrequency: optionalEnum(INTAKE_FREQUENCIES),
  sweetDrinksFrequency: optionalEnum(INTAKE_FREQUENCIES),
  fastFoodFrequency: optionalEnum(INTAKE_FREQUENCIES),
  vegetablesFrequency: optionalEnum(INTAKE_FREQUENCIES),
  fruitFrequency: optionalEnum(INTAKE_FREQUENCIES),
  dairyFrequency: optionalEnum(INTAKE_FREQUENCIES),
  redMeatFrequency: optionalEnum(INTAKE_FREQUENCIES),
  chickenFrequency: optionalEnum(INTAKE_FREQUENCIES),
  fishFrequency: optionalEnum(INTAKE_FREQUENCIES),
  sweetsFrequency: optionalEnum(INTAKE_FREQUENCIES),

  mealSchedule: mealScheduleSchema,
});

export type IntakeInput = z.infer<typeof intakeSchema>;

/**
 * Columns the client list may be ordered by.
 *
 * An allowlist, not a free-text column name: the value arrives from the query
 * string and is used to pick an ORDER BY, so anything outside this set has to
 * be impossible rather than merely unlikely. `createdAt` is the default and is
 * not a visible column — newest first is what the register means with no
 * explicit sort.
 */
export const CLIENT_SORTS = ['fullName', 'phone', 'age', 'portalAccess', 'createdAt'] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];

/**
 * Columns the register can be filtered on, and the one filter it holds at a
 * time.
 *
 * **Not `fullName`.** The search field beside the filter control is the name
 * filter, and always was — offering the same column twice in one toolbar is two
 * answers to "how do I find Ahmad".
 *
 * **One column at a time**, because the control is a chooser: pick the column,
 * give it a value. A stack of simultaneous filters is a different screen — a
 * saved-view feature — and this register is read by someone looking for one
 * thing.
 *
 * **`status` is not one of them any more.** It was in here as a filter value —
 * "Status → All" — which is how an archived client used to be found. It has its
 * own control now: the toggle in the toolbar, which swaps the whole list
 * between the register and the archive (`?status=archived`) rather than mixing
 * the two states into one. That is a better answer than a filter value for a
 * list you either are or are not looking at — it says what it is in the page
 * title and it puts Restore in front of you, instead of leaving you to spot
 * which rows are grey. Leaving the filter in as well would be two answers to
 * the same question, and it would let the register mix the two states in one
 * list, where the status column it needed has just been removed for saying
 * "active" on every row.
 *
 * **`phone` and `email` are not here either, and that leaves one.** They were
 * substring matches on two columns nobody searches a register by: a dietitian
 * looking someone up types a name, which is what the field beside the control
 * already does. Both were also the only *free-text* filters, so the popover had
 * to carry a text input for them and a chooser for the fixed-choice one, and the
 * two branches were most of the control.
 *
 * What is left are columns that answer a question a name cannot: who has a
 * portal login, whether a client has a nutrition plan at all, and where each
 * client stands in the plan period they are currently on. The chooser the
 * popover dropped when this was down to one column is back for exactly the
 * reason it was kept as an array — see `ClientFilterMenu`.
 *
 * ⚠ **One column at a time, still.** The second filter is a second *answer* to
 * "which question am I asking", not a second row stacked under the first. A pair
 * of simultaneous filters would need the URL to carry a value per column and the
 * popover to grow a field per column, and this register is read by someone
 * looking for one thing.
 *
 * An old link carrying `filterBy=phone` fails the enum and `.catch()` drops it,
 * which shows the register unfiltered rather than erroring.
 */
/**
 * The register's own columns — who this person is to the clinic.
 *
 * Neither of them is a question about money, which is why Bills does not offer
 * them: see {@link BILLS_FILTERS}.
 */
export const REGISTER_FILTERS = ['portalAccess', 'weeklyProgress', 'plan'] as const;

/**
 * The Bills screen's columns, and only its columns.
 *
 * Bills lists the same people as the register and is read for a different
 * reason, so it filters on different things. Portal access and weekly progress
 * are not questions anyone asks of a ledger, and the two columns on that table
 * a reader *does* narrow by are the two non-numeric ones:
 *
 * - `paymentStatus` — the chip closing every row: paid, part-paid, unpaid, or
 *   nothing billed yet. The screen's whole question is who owes
 *   what, and this is the column that answers it.
 * - `subscription` — where their term stands, which is the other column on that
 *   table carrying a state rather than a figure, and the one a renewal chase
 *   starts from.
 *
 * The three money columns are deliberately absent. A filter over an amount is a
 * *range* — "owing more than", "between" — which is a second control, a number
 * to type and a unit to get wrong, and the table already sorts by every one of
 * them: a reader after the largest debts sorts on Debt and reads down the page.
 * `paymentStatus` is the useful part of that question with nothing to type.
 *
 * The name is not here either, for the reason it never is: it is the search
 * field beside this control.
 */
export const BILLS_FILTERS = ['paymentStatus', 'subscription'] as const;

/**
 * Every column any register-shaped screen can filter on.
 *
 * One enum, because one URL: both screens are `listClients` with the same
 * parameters, and a link carrying a Bills filter should fail the same way a
 * link carrying a dead one does — `.catch()` drops it and the list shows
 * unfiltered — rather than throwing on the screen that does not offer it.
 * Which subset each screen *shows* is the popover's business, not the schema's.
 */
export const CLIENT_FILTERS = [...REGISTER_FILTERS, ...BILLS_FILTERS] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number];

/** What `portalAccess` filters on: the client has a portal login, or has not. */
export const PORTAL_ACCESS_VALUES = ['yes', 'no'] as const;

/**
 * What `weeklyProgress` filters on: where a client stands in the plan period
 * they are currently on.
 *
 * **The three answers are the register's own three kinds of nothing, plus the
 * one kind of something** — the same three the progress cell already draws
 * separately (see `WeeklyProgress` in `client-table.tsx`). Nothing here is a
 * *band*: no "on track" above some percentage and "slipping" below it.
 * Adherence is a continuum with no clinical threshold behind it — the cell's own
 * note on why it wears one colour at every value — and a filter that invented
 * one would be that threshold, applied silently to a list, which is worse than a
 * colour because the rows that fail it are not merely tinted, they are gone.
 *
 * What a dietitian can ask without a threshold is the useful question anyway:
 * who has reported nothing at all this period.
 *
 * - `reported` — a published plan covers today and the client has logged at
 *   least one of its days.
 * - `notReported` — a published plan covers today and the client has logged
 *   none of it. The one to open on a Wednesday.
 * - `noPlan` — no published plan covers today, so there is nothing to follow
 *   and silence means nothing.
 */
export const WEEKLY_PROGRESS_VALUES = ['reported', 'notReported', 'noPlan'] as const;
export type WeeklyProgressFilterValue = (typeof WEEKLY_PROGRESS_VALUES)[number];

/**
 * What `paymentStatus` filters on — the chip the Bills row ends with.
 *
 * Four of the five values `paymentStatus` in `features/billing/money.ts`
 * produces, in the order a reader wants them rather than the order that module
 * declares them: the two that are owed money lead, because that is what the
 * screen is opened for, and `none` — nothing billed yet — comes last as the
 * absence it is.
 *
 * ⚠ `credit` — paid past what was charged — is the fifth, and this filter does
 * not offer it. The chip still draws it, because a row in credit has to say so;
 * what the select loses is an answer nobody opens this screen to ask. The
 * ledger is read for who owes. A URL naming `credit` filters nothing, the same
 * way any other unknown value does.
 *
 * ⚠ Spelled out here rather than imported from `money.ts` so the register's
 * schema does not depend on the billing feature; `filter.paymentStatus.*` in
 * the catalogues has to cover every one of them, and `BILLS_FILTER_VALUES`
 * below is checked against the union that module exports at the one place that
 * reads both.
 */
export const PAYMENT_STATUS_VALUES = ['unpaid', 'partial', 'paid', 'none'] as const;
export type PaymentStatusFilterValue = (typeof PAYMENT_STATUS_VALUES)[number];

/**
 * What `subscription` filters on: inside a term, past one, or never on one.
 *
 * The Bills column's own three states — see `SubscriptionState` — and `none` is
 * offered here even though the table draws it as an em-dash rather than a chip.
 * "Who has never been on a subscription" is a list worth asking for; that it is
 * drawn as a blank is a reason to give the reader another way to find it, not a
 * reason to leave it out.
 */
export const SUBSCRIPTION_FILTER_VALUES = ['active', 'expired', 'none'] as const;
export type SubscriptionFilterValue = (typeof SUBSCRIPTION_FILTER_VALUES)[number];

/**
 * What `plan` filters on: the client has a nutrition plan on file, or has none.
 *
 * **This is not `weeklyProgress` asked twice.** That column is about *now* — the
 * plan period covering today and what has been logged inside it — so its
 * `noPlan` answer also returns everyone whose plan ran out last month. This one
 * is about whether the work has ever been done: a client with no plan at all is
 * someone the clinic has taken on and not yet written for, and that is the list
 * a dietitian clears down. A plan that ended is not on it.
 *
 * A draft counts as having one. The question is whether a plan exists for this
 * client, and a plan being written is a plan; an archived one does not, which is
 * what archiving means and matches the plan status the register's own cell
 * reads.
 */
export const PLAN_FILTER_VALUES = ['has', 'none'] as const;
export type PlanFilterValue = (typeof PLAN_FILTER_VALUES)[number];

/** The answers each filter column offers, in the order the popover lists them. */
export const CLIENT_FILTER_VALUES = {
  portalAccess: PORTAL_ACCESS_VALUES,
  weeklyProgress: WEEKLY_PROGRESS_VALUES,
  plan: PLAN_FILTER_VALUES,
  paymentStatus: PAYMENT_STATUS_VALUES,
  subscription: SUBSCRIPTION_FILTER_VALUES,
} as const satisfies Record<ClientFilter, readonly [string, ...string[]]>;

/**
 * How many subscribers one page of the register holds — as a range, not a
 * number, because it is a property of the screen rather than of the register.
 *
 * It was a single constant (`CLIENTS_PAGE_SIZE`, nine) chosen so that a page
 * fit "a laptop" without the list needing a scrollbar of its own. Nine fits the
 * screen it was measured on and no other: a 1366×768 laptop, a 1080p panel at
 * 125% scaling and a browser at 110% zoom all fit fewer, and on each of them the
 * pager — the only way through the register — went below the fold or off the
 * frame entirely.
 *
 * So the register measures instead of guessing. The browser reports how many
 * rows the bounded frame can hold and this range is what that answer is clamped
 * into:
 *
 * - `min` is the shortest usable page. Under it the frame simply overflows and
 *   the shell scrolls, which is the honest outcome for a window too short to
 *   hold a register at all.
 * - `max` caps what a tall monitor asks the database for.
 * - `fallback` is what the first paint draws with, before any browser has
 *   measured anything — the old nine, unchanged, so a cookie-less first visit
 *   looks exactly as it did.
 *
 * The Bills screen pages the same register through the same query and therefore
 * uses this same range. See `FitRows` for how the measurement travels.
 */
export const CLIENTS_ROWS = { min: 4, max: 14, fallback: 9 } as const satisfies FitRowsBounds;

/**
 * The name the register's measured row count is stored under.
 *
 * The register and Bills are the *same* list — the same query, the same
 * toolbar, the same pager, one screen showing people and the other showing what
 * they owe — drawn in the same frame at the same widths, so a row count measured
 * on one is the right answer on the other. Sharing the name shares the cookie,
 * and walking between the two costs no second measurement and no second refresh.
 */
export const CLIENTS_FIT_LIST = 'clients';

/**
 * List filters. Every field uses `.catch()` so a hand-edited query string
 * degrades to the default view instead of throwing a 500 at the user.
 *
 * `filterValue` is validated against the *column* rather than here — the one
 * remaining column takes `yes` or `no` — so the rule lives with the query that
 * applies it. Anything nonsensical is ignored there and the register falls back
 * to its default view.
 */
export const listClientsSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  /**
   * Which half of the register this is: the active list, or the archive.
   *
   * It comes off the query string now. The archive was a route of its own and
   * is a view of `/app/clients` — `?status=archived` — so the toolbar's toggle
   * swaps this one parameter and leaves the search, the filter and the sort
   * where they are. `.catch('active')` is what makes anything else in the
   * parameter show the register rather than throw.
   */
  status: z.enum(CLIENT_STATUSES).catch('active'),
  filterBy: z.preprocess(blankToUndefined, z.enum(CLIENT_FILTERS).optional().catch(undefined)),
  filterValue: z.preprocess(
    blankToUndefined,
    z.string().trim().max(120).optional().catch(undefined),
  ),
  sort: z.enum(CLIENT_SORTS).catch('createdAt'),
  dir: z.enum(['asc', 'desc']).catch('desc'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  /**
   * How many rows one page of the register holds.
   *
   * **Not from the query string.** It is the browser's answer to "how many rows
   * fit the frame", measured on the screen the register is being read on and
   * carried in a cookie — see `FitRows`. It is a field of this schema anyway
   * because it is an input to the same query as the page number, and because
   * `.catch()` is the same protection a hand-edited value needs here as
   * anywhere else on this object.
   *
   * The bounds are `CLIENTS_ROWS`, so a value from an older cookie or a
   * different build is clamped into the range this register can actually draw
   * rather than becoming a `LIMIT` nobody chose.
   */
  pageSize: z.coerce
    .number()
    .int()
    .min(CLIENTS_ROWS.min)
    .max(CLIENTS_ROWS.max)
    .catch(CLIENTS_ROWS.fallback),
});

export type ListClientsInput = z.infer<typeof listClientsSchema>;
