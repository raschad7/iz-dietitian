'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { signOutAction } from '@/features/auth/actions';
import { type Locale } from '@/i18n/routing';

/**
 * A real form posting to a server action, not a client-side `authClient.signOut`
 * call: the session cookie is httpOnly and cleared server side, and this keeps
 * working if JavaScript hasn't loaded.
 */
export function SignOutButton({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <SignOutSubmit className={className} />
    </form>
  );
}

/**
 * `destructiveGhost` — no box until you touch it, then a clay fill; the label
 * and glyph are clay throughout.
 *
 * Ending a session is not a delete, so it does not get the outlined
 * `destructive` box a delete gets — in the portal's bar it sits beside a
 * language switcher, and an outline there read as one more destination rather
 * than as the way out. The colour is what marks it, and the colour never
 * leaves.
 *
 * `sm` is the 40px compact size, matching the language switcher beside it.
 *
 * The staff rail no longer renders this: its sign-out is a `destructive` item
 * in the account menu, posting to the same action through a hidden form.
 */
function SignOutSubmit({ className }: { className?: string }) {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="destructiveGhost"
      size="sm"
      disabled={pending}
      className={className}
    >
      <Icon name="signOut" />
      {pending ? t('loading') : t('signOut')}
    </Button>
  );
}
