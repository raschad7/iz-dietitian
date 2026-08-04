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
        /*
          The visible label is the ISO code — `AR` / `EN` — because the switcher
          is 40px of a rail's width and two endonyms in two scripts never fit it
          without one of them truncating. The code is the same two characters in
          both locales, so the control stops changing width when the language
          does.

          `aria-label` carries the endonym instead, so a screen reader still
          announces "العربية" rather than spelling out two letters. There is no
          `lang` on the button any more: it was there to give "العربية" the
          Arabic face, and tagging Latin `AR` as Arabic tells a screen reader to
          pronounce it in the wrong language.
        */
        <button
          key={locale}
          type="button"
          disabled={isPending}
          aria-pressed={locale === activeLocale}
          aria-label={t(`${locale}Name`)}
          onClick={() => switchTo(locale)}
          className={cn(
            // `flex-1` only bites when the group is given a width — in the rail
            // it is `w-full`, so the two locales split it evenly.
            'flex h-full flex-1 items-center justify-center rounded-sm px-2.5 text-xs font-medium transition-colors disabled:opacity-50',
            /*
              Neutral, not olive. Olive marks what you can act on, and inside
              the profile menu this chip sat directly above a sign-out and
              below four destinations — the one brand-coloured thing in the
              panel, drawing the eye to the least consequential control in it.
              The selected locale is a *state*, so it takes the ambient
              highlight fill (n-100) and full-strength text: 15.9:1, and no
              claim on the pointer.
            */
            locale === activeLocale
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
          )}
        >
          {t(locale)}
        </button>
      ))}
    </div>
  );
}
