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
    // `h-10` matches the app bar's other controls — the sign-out button and the
    // notification bell are both the 40px toolbar size, and a switcher two
    // thirds their height made the row read as ragged.
    <div
      className={cn('inline-flex h-10 items-center gap-1 rounded-md border border-border p-1', className)}
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
            'flex h-full items-center rounded-sm px-2.5 text-xs font-medium transition-colors disabled:opacity-50',
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
