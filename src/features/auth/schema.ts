import { z } from 'zod';

import { defaultLocale, locales } from '@/i18n/routing';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants';

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

export const magicLinkSchema = z.object({
  email: emailSchema,
  locale: localeSchema,
});

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2),
    email: emailSchema,
    password: z.string().min(MIN_PASSWORD_LENGTH),
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
    password: z.string().min(MIN_PASSWORD_LENGTH),
    confirmPassword: z.string(),
    locale: localeSchema,
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
  });
