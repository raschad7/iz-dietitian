import { z } from 'zod';

import { defaultLocale, locales } from '@/i18n/routing';

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
  heightCm: z.preprocess(blankToUndefined, z.coerce.number().int().min(30).max(280).optional()),
  goal: optionalEnum(CLIENT_GOALS),
  activityLevel: optionalEnum(CLIENT_ACTIVITY_LEVELS),
  medicalNotes: optionalText(2000),
  allergies: optionalText(1000),
  notes: optionalText(2000),
});

export type ClientFormInput = z.infer<typeof clientFormSchema>;

/**
 * Columns the client list may be ordered by.
 *
 * An allowlist, not a free-text column name: the value arrives from the query
 * string and is used to pick an ORDER BY, so anything outside this set has to
 * be impossible rather than merely unlikely. `createdAt` is the default and is
 * not a visible column — newest first is what the register means with no
 * explicit sort.
 */
export const CLIENT_SORTS = ['fullName', 'phone', 'email', 'status', 'portalAccess', 'createdAt'] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];

/**
 * List filters. Every field uses `.catch()` so a hand-edited query string
 * degrades to the default view instead of throwing a 500 at the user.
 */
export const listClientsSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  status: z.enum([...CLIENT_STATUSES, 'all']).catch('active'),
  sort: z.enum(CLIENT_SORTS).catch('createdAt'),
  dir: z.enum(['asc', 'desc']).catch('desc'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type ListClientsInput = z.infer<typeof listClientsSchema>;
