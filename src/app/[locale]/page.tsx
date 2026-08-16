import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type LandingPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LandingPage({ params }: LandingPageProps) {
  await resolveLocale(params);

  const t = await getTranslations('landing');

  return (
    <main className="q-route-stage mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-4 text-start">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{t('title')}</h1>
        <p className="text-pretty text-lg text-muted-foreground">{t('description')}</p>
      </div>

      {/*
        Links styled as buttons, not <Button render={<Link/>}>: Base UI's Button
        defaults `nativeButton` to true and warns when it renders anything other
        than a real <button>, because that silently drops native button
        semantics. `buttonVariants` gives the same appearance on a real anchor.
      */}
      <div className="flex flex-wrap gap-3">
        {/* `primaryWhite` rather than `default`: the white label was asked for
            on both green buttons someone meets before signing in. */}
        <Link href="/login" className={buttonVariants({ variant: 'primaryWhite' })}>
          {t('staffCta')}
        </Link>
        <Link href="/client-login" className={buttonVariants({ variant: 'outline' })}>
          {t('clientCta')}
        </Link>
      </div>

      <p className="border-s-2 border-border ps-4 text-sm text-muted-foreground">{t('foundationNotice')}</p>
    </main>
  );
}
