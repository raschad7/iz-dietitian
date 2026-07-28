'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { defaultLocale, locales } from '@/i18n/routing';
import { auth } from '@/lib/auth';

/**
 * Auth is reached through server actions, like everything else in this app —
 * there is no REST or tRPC layer. `messageKey` is a key inside the `login`
 * namespace so the UI stays translatable.
 */
export type AuthFormState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'genericError' }
  | { status: 'sent'; messageKey: 'magicLinkSent' };

const localeSchema = z.enum(locales).catch(defaultLocale);

const credentialsSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
  locale: localeSchema,
});

const magicLinkSchema = z.object({
  email: z.email().trim().toLowerCase(),
  locale: localeSchema,
});

export async function signInWithPassword(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    return { status: 'error', messageKey: 'genericError' };
  }

  const { email, password, locale } = parsed.data;

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    // Deliberately opaque: never reveal whether the address exists.
    return { status: 'error', messageKey: 'genericError' };
  }

  // Outside the try/catch — `redirect` signals by throwing.
  redirect(`/${locale}/app`);
}

export async function requestMagicLink(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get('email'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    return { status: 'error', messageKey: 'genericError' };
  }

  const { email, locale } = parsed.data;

  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: `/${locale}/portal` },
      headers: await headers(),
    });
  } catch {
    // Swallowed on purpose — the response must not depend on whether the
    // address is registered.
  }

  return { status: 'sent', messageKey: 'magicLinkSent' };
}
