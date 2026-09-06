import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

/**
 * Page control for the platform's two unbounded tables.
 *
 * ## It says where you are, not just where you can go
 *
 * "Showing 51–100 of 342" is the half that matters. A pair of arrows tells the
 * reader they can move; the count tells them how much there is, which is what
 * decides whether they should be paging at all or narrowing the filter above.
 *
 * ## Links, not buttons
 *
 * Every page is a URL, so it can be bookmarked, opened in a second tab, and
 * stepped back out of with the browser's own back button.
 *
 * ⚠ **The app's `Link`, not a bare `<a>`.** A plain anchor is a document
 * navigation, and a fresh document is what `SplashLaunchGate` reads as the
 * application starting — so paging a table used to play the launch screen over
 * it, and pay for the whole shell to be re-fetched to move fifty rows. The
 * addresses are unchanged; only how the browser gets to them is.
 *
 * ## The arrows are logical, not physical
 *
 * `chevronStart` / `chevronEnd` rather than left and right. The icon registry
 * mirrors them for `dir="rtl"` — see the `DIRECTIONAL` set in `icon.tsx` — so
 * "next" points the way the reader's language reads, which in Arabic is
 * leftward. Using `chevronDown`-style physical names here is how a bidirectional
 * app ends up with a "next" arrow pointing back.
 */
export async function Pager({
  page,
  pageSize,
  total,
  locale,
  basePath,
  params,
}: {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  locale: Locale;
  /** Locale-less — `Link` adds the prefix. */
  basePath: string;
  /** Filters to carry across a page change. Undefined values are dropped. */
  params?: Record<string, string | undefined>;
}) {
  const t = await getTranslations('admin.filters');

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const href = (target: number) => {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) search.set(key, value);
    }

    // Page 1 is the bare URL. A `?page=1` that means the same as no parameter is
    // a second address for one screen, and it is the one that gets shared.
    if (target > 1) search.set('page', String(target));

    const query = search.toString();

    return query ? `${basePath}?${query}` : basePath;
  };

  /* Nothing to page through and nothing to say about it. A control that renders
     "Showing 0–0 of 0" under an empty table is repeating the table. */
  if (total === 0) return null;

  const link = cn(buttonVariants({ variant: 'outline', size: 'sm' }));
  const dead = cn(link, 'pointer-events-none opacity-50');

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={t('page', { page, pages })}>
      <p className="text-body-sm text-muted-foreground" dir="ltr">
        {t('showing', {
          from: formatNumber(locale, from),
          to: formatNumber(locale, to),
          total: formatNumber(locale, total),
        })}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-body-sm text-muted-foreground">
          {t('page', { page: formatNumber(locale, page), pages: formatNumber(locale, pages) })}
        </span>

        {/*
          A disabled link is an `aria-disabled` anchor with no `href`, not an
          `<a>` that goes nowhere: a href-less anchor is not focusable and not
          announced as a link, which is exactly right for an edge the reader has
          already reached.
        */}
        {page > 1 ? (
          <Link href={href(page - 1)} className={link} rel="prev">
            <Icon name="chevronStart" className="size-4" aria-hidden />
            {t('previous')}
          </Link>
        ) : (
          <span className={dead} aria-disabled>
            <Icon name="chevronStart" className="size-4" aria-hidden />
            {t('previous')}
          </span>
        )}

        {page < pages ? (
          <Link href={href(page + 1)} className={link} rel="next">
            {t('next')}
            <Icon name="chevronEnd" className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={dead} aria-disabled>
            {t('next')}
            <Icon name="chevronEnd" className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
