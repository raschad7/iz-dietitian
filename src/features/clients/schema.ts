import { z } from 'zod';

import { defaultLocale, locales } from '@/i18n/routing';

import { ALLERGENS, mealScheduleSchema } from './nutrition';

/**
 * Allowed values for the enum-like text columns. These live here rather than in
 * the database so extending them is a code change, not a migration.
 */
export const CLIENT_STATUSES = ['active', 'archived'] as const;
export const CLIENT_SEXES = ['female', 'male'] as const;
export const CLIENT_GOALS = ['weight_loss', 'weight_gain', 'maintenance', 'medical', 'sports'] as const;
export const CLIENT_ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;

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
 */
export const clientFormSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: optionalText(40),
  /**
   * `.pipe()`, not `z.email().trim()`. In Zod 4 `z.email()` bakes its format
   * check in at construction, so a chained `.trim()` runs only AFTER validation
   * — and "  a@b.co " is rejected before anything gets a chance to trim it.
   * Normalise as a plain string first, then validate the result.
   */
  email: z.preprocess(blankToUndefined, z.string().trim().toLowerCase().pipe(z.email()).optional()),
  preferredLocale: localeSchema,
  dateOfBirth: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
      .optional(),
  ),
  sex: optionalEnum(CLIENT_SEXES),
});

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

  // ── Measurements, from `clients` ─────────────────────────────────────────
  heightCm: z.preprocess(blankToUndefined, z.coerce.number().int().min(30).max(280).optional()),
  goal: optionalEnum(CLIENT_GOALS),
  activityLevel: optionalEnum(CLIENT_ACTIVITY_LEVELS),

  /**
   * Current weight, from `client_nutrition_profiles`.
   *
   * The generous range still catches a slipped decimal: 500 kg is not a client,
   * it is a typo. One value and not a history — a weight log with a trend chart
   * is a feature of its own and nobody has asked for it yet.
   */
  weightKg: z.preprocess(blankToUndefined, z.coerce.number().min(20).max(400).optional()),

  // ── Allergies: the tags filter, the prose does not ───────────────────────
  /**
   * The structured list — the only thing the dish catalog filters on. A
   * `FormData` with one ticked box yields a string rather than an array, which
   * is why this coerces before parsing.
   */
  allergenTags: z.preprocess(
    (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]),
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
      const list = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

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
 * "Status → All" — which is how an archived client used to be found. Archived
 * clients have their own page now (`/app/clients/archived`), and a *place* is a
 * better answer than a filter for a list you either are or are not looking at:
 * it can be linked to, it can say what it is at the top, and it puts Restore in
 * front of you instead of leaving you to spot which rows are grey. Leaving the
 * filter in as well would be two answers to the same question, and it would let
 * the register mix the two states in one list, where the status column it
 * needed has just been removed for saying "active" on every row.
 */
export const CLIENT_FILTERS = ['phone', 'email', 'portalAccess'] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number];

/** What `portalAccess` filters on: the client has a portal login, or has not. */
export const PORTAL_ACCESS_VALUES = ['yes', 'no'] as const;

/**
 * List filters. Every field uses `.catch()` so a hand-edited query string
 * degrades to the default view instead of throwing a 500 at the user.
 *
 * `filterValue` is validated against the *column* rather than here — an enum
 * for status and portal access, free text for phone and email — so the rule
 * lives with the query that applies it. Anything nonsensical is ignored there
 * and the register falls back to its default view.
 */
export const listClientsSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  /**
   * Which half of the register this is.
   *
   * Set by the route, not by the reader: `/app/clients` is `active` and
   * `/app/clients/archived` is `archived`, and both pass it explicitly. It is
   * still parsed from the same object because both pages share one schema and
   * one query — the only thing that differs between them is this value.
   */
  status: z.enum(CLIENT_STATUSES).catch('active'),
  filterBy: z.preprocess(blankToUndefined, z.enum(CLIENT_FILTERS).optional().catch(undefined)),
  filterValue: z.preprocess(blankToUndefined, z.string().trim().max(120).optional().catch(undefined)),
  sort: z.enum(CLIENT_SORTS).catch('createdAt'),
  dir: z.enum(['asc', 'desc']).catch('desc'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type ListClientsInput = z.infer<typeof listClientsSchema>;
