import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/**
 * Lives one segment above `[clientId]`, not beside it. `not-found.js` cannot
 * catch a `notFound()` thrown by its own segment's `layout.js` — only one
 * thrown by a *child* of that layout — so a copy of this file inside
 * `[clientId]/` never rendered; the bad-id case fell through every boundary
 * to Next's built-in fallback instead. This segment's own layout (`app/`) is
 * what stays up, so the request still lands inside the shell.
 */
export default async function ClientNotFound() {
  const t = await getTranslations('clients');

  return (
    <div className="space-y-4 text-start">
      <h1 className="text-2xl font-semibold tracking-tight">{t('notFound')}</h1>
      <p className="text-muted-foreground">{t('notFoundDescription')}</p>
      <Link href="/app/clients" className={buttonVariants({ variant: 'outline' })}>
        {t('backToList')}
      </Link>
    </div>
  );
}
