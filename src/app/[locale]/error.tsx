'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { BrandLogo } from '@/components/layout/brand-logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';

/**
 * When a screen *outside* the two signed-in areas throws while rendering — the
 * landing page, sign-in, sign-up, onboarding, password reset.
 *
 * `app/error.tsx` and the portal's own boundary each catch their area, and
 * between them they covered every screen a signed-in user sees. They did not
 * cover the screens a signed-*out* visitor sees, and those are the ones where a
 * blank document is least recoverable: there is no rail and no tab bar to
 * navigate away with, so the only way out was the browser's back button.
 *
 * The logo, rather than a heading naming the product: this may be the only
 * thing that renders, and a visitor who has just watched a page fail should at
 * least be able to see it is still the right site.
 *
 * `reset()` re-renders the segment without a reload — the right first move for
 * a fault that will not repeat. Home is the way out of the one that does.
 * Nothing here says what broke: the detail goes to the console, where it is a
 * developer's problem.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  /* Only `retry` is borrowed from the signed-in boundary's strings. Its `body`
     is not: it offers the dashboard, which nobody on these screens has. */
  const tScreen = useTranslations('errors.screen');
  const tApp = useTranslations('app');

  useEffect(() => {
    console.error('[public] screen failed to render', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <BrandLogo aria-hidden={false} role="img" aria-label={tApp('name')} className="h-10" />

      <div className="space-y-2">
        <h1 className="font-heading text-heading-lg font-semibold">{t('unexpected')}</h1>
        <p className="text-pretty text-body-sm leading-relaxed text-muted-foreground">
          {t('unexpectedBody')}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={reset}>
          <Icon name="refresh" />
          {tScreen('retry')}
        </Button>

        {/* A link styled as a button, not `<Button render={<Link/>}>` — Base UI's
            Button warns when it renders anything but a real `<button>`.

            `notFoundCtaHome` because this link goes to `/`. The key was
            `notFoundCta` and served both this screen and the 404 page; that one
            now picks its destination from the session, so the label was split
            in two by where it leads.

            This is a client component and cannot read a session, and it no
            longer needs to: `/` is not a public home any more, it is the
            redirect that asks that very question on the server — staff to
            `/app`, a client to `/portal`, nobody to `/login`. So this one link
            is right for all three without knowing which it is. */}
        <Link href="/" className={buttonVariants({ variant: 'ghost' })}>
          {t('notFoundCtaHome')}
        </Link>
      </div>
    </main>
  );
}
