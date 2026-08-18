import { getTranslations } from 'next-intl/server';

import { BrandLogo } from '@/components/layout/brand-logo';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/**
 * The 404 page, for the whole locale.
 *
 * The `errors.notFound` strings have been in both message files for a while
 * with nothing rendering them — an unmatched URL fell through to Next's own
 * default, which is unstyled, English-only and left-to-right whichever locale
 * you were in.
 *
 * It sits inside `[locale]` rather than at `src/app/`, so it renders inside the
 * locale layout and has a language, a direction and the app's fonts. Every
 * request reaches it with a prefix already on it — `src/proxy.ts` redirects
 * anything without one — so there is no unprefixed path left for a root-level
 * copy to catch.
 *
 * The logo is here and *not* on the sign-in screen, which is deliberate: this
 * is a dead end with nothing else on it, so the mark is what tells a lost
 * visitor whose site they are still on.
 */
export default async function NotFound() {
  const t = await getTranslations('errors');
  const tApp = await getTranslations('app');

  return (
    <main className="q-route-stage mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <BrandLogo aria-hidden={false} role="img" aria-label={tApp('name')} className="h-10" />

      <div className="space-y-2">
        <h1 className="font-heading text-heading-lg font-semibold">{t('notFound')}</h1>
        <p className="text-pretty text-body-sm leading-relaxed text-muted-foreground">
          {t('notFoundDescription')}
        </p>
      </div>

      {/*
        Home, not "back". The browser's own back button already does back, and
        the history entry behind a mistyped link is as likely to be another dead
        end as it is to be somewhere useful.

        A link styled as a button rather than `<Button render={<Link/>}>` — Base
        UI's Button warns when it renders anything but a real `<button>`. Same
        reasoning as the landing page.
      */}
      <Link href="/" className={buttonVariants({ variant: 'default' })}>
        {t('notFoundCta')}
      </Link>
    </main>
  );
}
