import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type LandingPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LandingPage({ params }: LandingPageProps) {
  await resolveLocale(params);

  const t = await getTranslations('landing');

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-4 text-start">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{t('title')}</h1>
        <p className="text-pretty text-lg text-muted-foreground">{t('description')}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="lg" render={<Link href="/app" />}>
          {t('staffCta')}
        </Button>
        <Button size="lg" variant="outline" render={<Link href="/portal" />}>
          {t('clientCta')}
        </Button>
      </div>

      <p className="border-s-2 border-border ps-4 text-sm text-muted-foreground">{t('foundationNotice')}</p>
    </main>
  );
}
