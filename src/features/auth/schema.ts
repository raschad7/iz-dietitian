import { z } from 'zod';

import { defaultLocale, locales } from '@/i18n/routing';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants';

import {
  CLIENT_MIN_PASSWORD_LENGTH,
  isCommonPassword,
  isStrongClientPassword,
  isStrongStaffPassword,
} from './password-policy';

export const localeSchema = z.enum(locales).catch(defaultLocale);

/**
 * Normalise as a plain string, THEN validate as an email.
 *
 * `z.email().trim()` does not work: in Zod 4 the format check is baked in at
 * construction, so it runs before the trim and rejects "  a@b.co " outright.
 */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  locale: localeSchema,
  redirectTo: z.string().optional(),
});

export const portalSignInSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(60),
  password: z.string().min(1),
  locale: localeSchema,
});

/**
 * The client password rule, in one place — the counterpart of
 * `staffPasswordSchema` below, and no longer merely a shorter version of it.
 *
 * Length was the whole rule here once, which meant `aaaaaa` could replace a
 * ten-character random temporary password and the account came out weaker for
 * the change. Each failure carries its own message key because the advice
 * differs, and the actions read the key straight off the issue.
 *
 * ⚠ `clientPasswordTooWeak`, not `passwordTooWeak`. The two rules diverged when
 * the client minimum went to eight characters with a letter and a digit: staff
 * still take any two of the three character classes, so the staff sentence
 * ("letters with numbers or symbols") describes a rule this schema does not
 * enforce. One key per rule is what keeps a screen from advertising a symbol
 * that will then be rejected.
 */
const clientPasswordSchema = z
  .string()
  .min(CLIENT_MIN_PASSWORD_LENGTH, { message: 'passwordTooShort' })
  // Before the general strength rule, so `password1` — which fails both — is
  // answered with the specific sentence rather than the generic one.
  .refine((value) => !isCommonPassword(value), { message: 'passwordTooCommon' })
  .refine(isStrongClientPassword, { message: 'clientPasswordTooWeak' });

export const setPasswordSchema = z
  .object({
    password: clientPasswordSchema,
    confirmPassword: z.string(),
    locale: localeSchema,
  })
  .refine((values) => values.password === values.confirmPassword, { path: ['confirmPassword'] });

/**
 * The staff password rule, in one place: long enough, and not a password in
 * name only. The two failures carry their own message keys because the advice
 * differs — one says "longer", the other says "mix in a digit or a symbol" —
 * and `signup-validation.ts` reads the key straight off the issue.
 */
const staffPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, { message: 'passwordTooShort' })
  .refine(isStrongStaffPassword, { message: 'passwordTooWeak' });

/**
 * One half of a practitioner's name.
 *
 * Ten characters is a tight ceiling for a real name, so it is stated here once
 * and enforced with `maxLength` on the inputs as well — a limit that stops the
 * typing is kinder than one that rejects it afterwards, and this schema is the
 * server's copy of the same rule.
 */
export const MAX_NAME_PART_LENGTH = 10;

const namePartSchema = z.string().trim().min(1).max(MAX_NAME_PART_LENGTH);

export const signUpSchema = z
  .object({
    firstName: namePartSchema,
    lastName: namePartSchema,
    email: emailSchema,
    password: staffPasswordSchema,
    confirmPassword: z.string(),
    locale: localeSchema,
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  locale: localeSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: staffPasswordSchema,
    confirmPassword: z.string(),
    locale: localeSchema,
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
  });

/**
 * The signed-in client's own change of their own password. Unlike
 * `setPasswordSchema` — the forced first-sign-in change, which never asks for
 * the temporary password — this one exists to prove the person holds the
 * current password before replacing it, so `currentPassword` is required here
 * and nowhere else.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: clientPasswordSchema,
    confirmNewPassword: z.string(),
    locale: localeSchema,
  })
  .refine((values) => values.newPassword === values.confirmNewPassword, {
    path: ['confirmNewPassword'],
  });
