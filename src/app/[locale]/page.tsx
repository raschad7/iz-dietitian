import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { cn } from '@/lib/utils';

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
        {/* `text-white`, not the `default` variant's dark `--primary-foreground`
            — the same override the auth screens' submit button carries, so the
            two green buttons someone meets before signing in look alike. */}
        <Link href="/login" className={cn(buttonVariants(), 'text-white')}>
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
