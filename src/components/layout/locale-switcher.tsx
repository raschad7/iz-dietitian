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
    // `h-10` matches the sign-out button stacked below it in the rail — both
    // are the 40px compact size, and a switcher two thirds that height made the
    // pair read as ragged.
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
            // `flex-1` only bites when the group is given a width — in the rail
            // it is `w-full`, so the two locales split it evenly.
            'flex h-full flex-1 items-center justify-center rounded-sm px-2.5 text-xs font-medium transition-colors disabled:opacity-50',
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
