'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';

/**
 * When a screen in the dietitian's app throws while rendering.
 *
 * **Without this file a single client-side throw took the whole application
 * with it.** React unmounts the tree at the nearest boundary, and the nearest
 * boundary was Next's root — so a bad render anywhere left a blank document and
 * a rail that had gone with it, and the only way back was a reload. The
 * planner is the screen that showed this up: it holds thirty-five cards, an
 * optimistic reducer and a floating panel over a board that revalidates
 * underneath it, and "it stopped and I had to refresh" is what that looks like
 * from the outside.
 *
 * The boundary is at `/app` rather than on the planner alone because the fault
 * is not the planner's: every screen here composes feature components over
 * server data, and any of them is one unexpected shape away from the same
 * throw. Catching it a segment lower would only mean writing this file again.
 *
 * `reset()` re-renders the segment without a reload, which is the right first
 * move for a fault that will not repeat. The rail survives either way — it is
 * in the layout above — so unlike the portal's boundary this one does not have
 * to rebuild navigation, and the dashboard link is here for the fault that
 * *does* repeat.
 *
 * The message says nothing about what broke. A dietitian cannot act on a stack
 * trace; the real detail goes to the console, where it is a developer's
 * problem.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.screen');

  useEffect(() => {
    console.error('[app] screen failed to render', error);
  }, [error]);

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-3 md:p-5">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-heading text-heading-sm font-semibold">{t('title')}</h1>
            <p className="text-body-sm leading-relaxed text-muted-foreground">{t('body')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={reset}>
              <Icon name="refresh" />
              {t('retry')}
            </Button>

            <Button variant="ghost" render={<Link href="/app" />}>
              {t('dashboard')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
