import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { HEIGHT_CM_RANGE, MAX_AGE, MIN_AGE, WEIGHT_KG_RANGE } from './form-rules';
import { clientFormSchema, intakeSchema, listClientsSchema } from './schema';

/**
 * The card's five required answers. Every test below starts from a complete one
 * and breaks a single field, so a failure names the rule it broke.
 *
 * The date of birth is a literal rather than a relative one: it has to stay
 * inside the age bounds for these to test what they claim, and 1990 does that
 * until the 2090s. The bounds themselves are tested against today — see
 * `birthdayNYearsAgo`.
 */
const minimal = {
  firstName: 'أحمد',
  lastName: 'خليل',
  phone: '+970599123456',
  dateOfBirth: '1990-06-15',
  sex: 'female',
};

describe('clientFormSchema', () => {
  test('joins the two name fields into the stored name', () => {
    const result = clientFormSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    expect(result.data?.fullName).toBe('أحمد خليل');
  });

  /*
    Each is required on its own, and the message is a key rather than English
    prose — the card looks it up under `clients.validation.*`.

    Pinned on the FIRST message rather than the whole list. An empty phone fails
    its length, its format and its national-part check at once, and what the
    field renders is `fieldErrors[field][0]` — so that is the assertion that
    describes what the reader sees.
  */
  test.each(['firstName', 'lastName', 'phone', 'dateOfBirth', 'sex'])('requires %s', (field) => {
    const result = clientFormSchema.safeParse({ ...minimal, [field]: '' });
    expect(result.success).toBe(false);
    expect(result.error && z.flattenError(result.error).fieldErrors[field]?.[0]).toBe('required');
  });

  // An unchecked radio group submits nothing at all, unlike an untouched text
  // input — both have to read as "not answered" rather than as a missing key.
  test('treats an absent field as unanswered rather than malformed', () => {
    const result = clientFormSchema.safeParse({ ...minimal, sex: null });
    expect(result.error && z.flattenError(result.error).fieldErrors.sex).toEqual(['required']);
  });

  test('caps each half of the name at ten characters', () => {
    const result = clientFormSchema.safeParse({ ...minimal, lastName: 'ا'.repeat(11) });
    expect(result.error && z.flattenError(result.error).fieldErrors.lastName).toEqual([
      'lastNameTooLong',
    ]);
  });

  test('accepts a name of exactly ten characters', () => {
    expect(clientFormSchema.safeParse({ ...minimal, lastName: 'ا'.repeat(10) }).success).toBe(true);
  });

  test('rejects letters in the phone number', () => {
    const result = clientFormSchema.safeParse({ ...minimal, phone: '+97059abc456' });
    expect(result.error && z.flattenError(result.error).fieldErrors.phone).toEqual([
      'phoneDigitsOnly',
    ]);
  });

  /*
    Measured on the national part, not on the whole string: the calling code is
    a control of its own and its digits are not something anyone typed. A flat
    cap would have spent four characters on `+1876` and left a Jamaican number
    six digits shorter than a Palestinian one.
  */
  test('caps the phone at ten digits after the calling code', () => {
    expect(clientFormSchema.safeParse({ ...minimal, phone: '+97059912345678' }).success).toBe(false);
    expect(clientFormSchema.safeParse({ ...minimal, phone: '+9705991234567' }).success).toBe(true);
    expect(clientFormSchema.safeParse({ ...minimal, phone: '+18761234567890' }).success).toBe(true);
  });

  // The regex this replaced accepted it, and PostgreSQL answered with a 500.
  test('rejects a date that does not exist', () => {
    const result = clientFormSchema.safeParse({ ...minimal, dateOfBirth: '2026-02-30' });
    expect(result.error && z.flattenError(result.error).fieldErrors.dateOfBirth?.[0]).toBe(
      'invalidDate',
    );
  });

  /*
    The age bounds, written against today rather than against fixed dates: a
    literal `1990-06-15` is 35 now and 45 in a decade, so a test pinning the
    hundred-year edge to one would start failing on its own.

    A birthday today makes the age exactly N, which is what puts each case on
    the inclusive edge it is meant to sit on.
    */
  const birthdayNYearsAgo = (years: number) => {
    const today = new Date();
    const date = new Date(today.getFullYear() - years, today.getMonth(), today.getDate());
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;
  };

  test.each([MIN_AGE, 40, MAX_AGE])('accepts an age of %i', (age) => {
    expect(clientFormSchema.safeParse({ ...minimal, dateOfBirth: birthdayNYearsAgo(age) }).success)
      .toBe(true);
  });

  // Each end names itself, rather than both reciting the whole range.
  test.each([
    [MIN_AGE - 1, 'ageTooYoung'],
    [MAX_AGE + 1, 'ageTooOld'],
  ])('rejects an age of %i as %s', (age, key) => {
    const result = clientFormSchema.safeParse({
      ...minimal,
      dateOfBirth: birthdayNYearsAgo(age as number),
    });
    expect(result.error && z.flattenError(result.error).fieldErrors.dateOfBirth?.[0]).toBe(key);
  });

  /*
    The commonest real mistake on this field: a year typed as this one.

    ⚠ It is also the case that pins `ageVerdict`'s handling of a null age.
    `calculateAge` refuses to believe a negative one, so a future date reads as
    "unknown" rather than as "too young" — and a pair of bounds that let an
    unknown age pass would accept a client born next year.
  */
  test('rejects a date of birth in the future as too young', () => {
    const result = clientFormSchema.safeParse({ ...minimal, dateOfBirth: birthdayNYearsAgo(-1) });
    expect(result.error && z.flattenError(result.error).fieldErrors.dateOfBirth?.[0]).toBe(
      'ageTooYoung',
    );
  });

  test('treats a blank email as absent — it is the one optional field', () => {
    const result = clientFormSchema.safeParse({ ...minimal, email: '' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBeUndefined();
  });

  test('lowercases and trims email', () => {
    const result = clientFormSchema.safeParse({ ...minimal, email: '  Sara@Clinic.PS ' });
    expect(result.data?.email).toBe('sara@clinic.ps');
  });

  test('rejects a malformed email', () => {
    expect(clientFormSchema.safeParse({ ...minimal, email: 'not-an-email' }).success).toBe(false);
  });

  test('rejects an unknown enum value', () => {
    expect(clientFormSchema.safeParse({ ...minimal, sex: 'unknown' }).success).toBe(false);
  });

  // The clinical fields moved to `intakeSchema`; the card must not silently
  // accept and then drop one, which is how a height typed into the wrong form
  // would vanish without an error.
  test('ignores clinical fields — they belong to the intake', () => {
    const result = clientFormSchema.safeParse({ ...minimal, heightCm: '172', goal: 'weight_loss' });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('heightCm');
    expect(result.data).not.toHaveProperty('goal');
  });

  test('rejects a malformed date of birth', () => {
    expect(clientFormSchema.safeParse({ ...minimal, dateOfBirth: '15/06/1990' }).success).toBe(false);
  });

  test('defaults preferredLocale to Arabic', () => {
    expect(clientFormSchema.safeParse(minimal).data?.preferredLocale).toBe('ar');
  });

  test('reports every offending field, so the form can highlight all of them', () => {
    const result = clientFormSchema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
    const fieldErrors = result.error ? Object.keys(z.flattenError(result.error).fieldErrors) : [];
    // An empty submit must light up all four at once rather than one per press.
    expect(fieldErrors).toContain('firstName');
    expect(fieldErrors).toContain('lastName');
    expect(fieldErrors).toContain('phone');
    expect(fieldErrors).toContain('dateOfBirth');
    expect(fieldErrors).toContain('sex');
    expect(fieldErrors).toContain('email');
  });
});

describe('listClientsSchema', () => {
  test('defaults to an unfiltered page one', () => {
    const result = listClientsSchema.parse({});
    expect(result.filterBy).toBeUndefined();
    expect(result.filterValue).toBeUndefined();
    expect(result.page).toBe(1);
    expect(result.q).toBeUndefined();
  });

  test('falls back to defaults instead of throwing on junk input', () => {
    const result = listClientsSchema.parse({ filterBy: 'nonsense', page: 'abc' });
    expect(result.filterBy).toBeUndefined();
    expect(result.page).toBe(1);
  });

  test('drops a filter column that has been retired', () => {
    // A bookmark or a back button can still be carrying `filterBy=phone` from
    // before those columns were removed. It has to show the register, not a 500
    // and not an empty list.
    for (const retired of ['phone', 'email', 'status']) {
      const result = listClientsSchema.parse({ filterBy: retired, filterValue: '0599' });
      expect(result.filterBy).toBeUndefined();
    }
  });

  test('accepts a filter column, its value and a page number', () => {
    const result = listClientsSchema.parse({
      filterBy: 'portalAccess',
      filterValue: ' yes ',
      page: '3',
      q: '  أحمد ',
    });
    expect(result.filterBy).toBe('portalAccess');
    expect(result.filterValue).toBe('yes');
    expect(result.page).toBe(3);
    expect(result.q).toBe('أحمد');
  });

  test('status is the route\'s to set, and defaults to the active register', () => {
    // It is no longer a `filterBy` value: archived clients have their own page,
    // and a hand-edited query string must not swap one list for the other.
    expect(listClientsSchema.parse({}).status).toBe('active');
    expect(listClientsSchema.parse({ status: 'archived' }).status).toBe('archived');
    expect(listClientsSchema.parse({ status: 'nonsense' }).status).toBe('active');
    expect(listClientsSchema.parse({ filterBy: 'status' }).filterBy).toBeUndefined();
  });

  test('defaults to newest first', () => {
    const result = listClientsSchema.parse({});
    expect(result.sort).toBe('createdAt');
    expect(result.dir).toBe('desc');
  });

  test('accepts a sortable column and a direction', () => {
    const result = listClientsSchema.parse({ sort: 'fullName', dir: 'asc' });
    expect(result.sort).toBe('fullName');
    expect(result.dir).toBe('asc');
  });

  /* The sort key picks an ORDER BY, so a column name off the allowlist must
     never reach the query builder. */
  test('rejects a sort column that is not on the allowlist', () => {
    const result = listClientsSchema.parse({ sort: 'passwordHash', dir: 'sideways' });
    expect(result.sort).toBe('createdAt');
    expect(result.dir).toBe('desc');
  });
});

describe('intakeSchema', () => {
  /**
   * A complete intake. The four measurements are required — see the ⚠ on
   * `intakeSchema` — and everything else on the form stays optional, which the
   * last test here pins so the exception does not quietly spread.
   */
  const intake = {
    clientId: '00000000-0000-4000-8000-000000000000',
    heightCm: '172',
    weightKg: '70',
    goal: 'weight_loss',
    activityLevel: 'moderate',
    allergenTags: [],
    customAllergens: [],
    mealSchedule: [{ slotKey: 'breakfast', label: 'فطور', timeOfDay: '08:00', kcalShare: 1 }],
  };

  const firstError = (patch: Record<string, unknown>, field: keyof typeof intake) => {
    const result = intakeSchema.safeParse({ ...intake, ...patch });
    if (result.success) return null;

    return z.flattenError(result.error).fieldErrors[field]?.[0] ?? null;
  };

  test('accepts a complete intake', () => {
    expect(intakeSchema.safeParse(intake).success).toBe(true);
  });

  /*
    An untouched number input submits `''` and an unchosen select submits
    nothing — both have to read as `required` rather than as a range error. This
    is why the numbers preprocess through `blankToUndefined`: `z.coerce.number`
    reads `''` as 0, which would fail the lower bound instead.
  */
  test.each(['heightCm', 'weightKg', 'goal', 'activityLevel'])('requires %s', (field) => {
    expect(firstError({ [field]: '' }, field)).toBe('required');
    expect(firstError({ [field]: undefined }, field)).toBe('required');
  });

  test('bounds the height, inclusive', () => {
    expect(firstError({ heightCm: String(HEIGHT_CM_RANGE.max) }, 'heightCm')).toBeNull();
    expect(firstError({ heightCm: String(HEIGHT_CM_RANGE.max + 1) }, 'heightCm')).toBe(
      'heightOutOfRange',
    );
    expect(firstError({ heightCm: String(HEIGHT_CM_RANGE.min - 1) }, 'heightCm')).toBe(
      'heightOutOfRange',
    );
  });

  test('bounds the weight, inclusive', () => {
    expect(firstError({ weightKg: String(WEIGHT_KG_RANGE.max) }, 'weightKg')).toBeNull();
    expect(firstError({ weightKg: String(WEIGHT_KG_RANGE.max + 1) }, 'weightKg')).toBe(
      'weightOutOfRange',
    );
    // Half a kilo is how a scale reads, so the weight is not an integer.
    expect(firstError({ weightKg: '70.5' }, 'weightKg')).toBeNull();
  });

  /*
    ⚠ The rest of the intake must NOT follow the four above. It is filled in
    across several visits, and a form that refuses to save an incomplete one
    loses whatever had already been typed.
  */
  test('leaves every other field optional', () => {
    const result = intakeSchema.safeParse({
      ...intake,
      occupation: '',
      sleepHours: '',
      bloodType: '',
      conditions: '',
      visitReason: '',
    });

    expect(result.success).toBe(true);
  });
});
