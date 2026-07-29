'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { signInWithGoogle } from '@/features/auth/actions';
import { type Locale } from '@/i18n/routing';

/**
 * Staff pages only. Patients sign in with a single-use emailed link; offering
 * them Google here would invite them to try a door that is not theirs.
 */
export function GoogleButton({ locale }: { locale: Locale }) {
  const t = useTranslations('login');

  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline" className="w-full">
        {t('continueWithGoogle')}
      </Button>
    </form>
  );
}
