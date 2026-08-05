'use client';

import { RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';

/**
 * When an account screen cannot load.
 *
 * **Two ways out, and the second one matters more.** Retrying is right when the
 * database blinked, and `reset()` re-renders the segment without a full reload.
 * But a fault that repeats leaves a client stranded on a screen with no
 * navigation of its own — these screens have no tab bar — so there is always a
 * plain link home beside it.
 *
 * **It says nothing about what broke.** The client cannot act on a stack trace
 * and the message would be in the wrong language anyway; the real detail goes
 * to the console, where it is a developer's problem. What the client is told is
 * true and useful: nothing they did caused this, their record is intact, and
 * here are two buttons.
 *
 * An error boundary must be a client component, and it must not assume the
 * layout above it rendered — so this brings its own padding rather than relying
 * on a `main` that may never have existed.
 */
export default function ScreenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('portal.screen.error');

  useEffect(() => {
    console.error('[portal] account screen failed to render', error);
  }, [error]);

  return (
    <main className="flex min-w-0 flex-1 items-start px-4 py-8 md:px-6">
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <h1 className="font-heading text-base font-medium">{t('title')}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('body')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="default" onClick={reset}>
              <RotateCw className="size-4" strokeWidth={1.9} aria-hidden="true" />
              {t('retry')}
            </Button>

            <Link
              href="/portal"
              className="inline-flex min-h-9 items-center px-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('home')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
