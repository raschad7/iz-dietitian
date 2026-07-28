'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('localeSwitcher');
  const activeLocale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchTo(nextLocale: Locale) {
    if (nextLocale === activeLocale) return;
    startTransition(() => {
      // `pathname` here is locale-agnostic; the router re-adds the prefix.
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <div
      className={cn('inline-flex items-center gap-1 rounded-md border border-border p-1', className)}
      role="group"
      aria-label={t('label')}
    >
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          disabled={isPending}
          aria-pressed={locale === activeLocale}
          onClick={() => switchTo(locale)}
          className={cn(
            'rounded-sm px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
            locale === activeLocale
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {t(locale)}
        </button>
      ))}
    </div>
  );
}

/**
 * Floating switcher mounted in the root layout. Development only — the
 * production build tree-shakes it away, since locale switching in production
 * belongs in the real chrome of each area.
 */
export function DevLocaleSwitcher() {
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className="fixed bottom-4 end-4 z-50">
      <LocaleSwitcher className="bg-background/90 shadow-sm backdrop-blur" />
    </div>
  );
}
