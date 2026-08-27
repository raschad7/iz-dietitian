'use client';

import { useLocale } from 'next-intl';
import { useMemo, type ComponentProps } from 'react';

import { startNavigationProgress } from '@/components/layout/navigation-progress';

import { getPathname, IntlLink, useIntlRouter } from './navigation-base';

type PathnameArgs = Parameters<typeof getPathname>[0];

/**
 * Is this navigation going to the address the reader is already at?
 *
 * A link to where you already are is still a navigation as far as Next is
 * concerned — the route re-runs in place — but it never moves the address bar,
 * and the address bar is the only thing `NavigationProgressWatcher` watches. So
 * a bar armed for one is a bar nothing is left to finish: it draws after
 * `APPEAR_AFTER_MS` and then trickles out the full ten seconds of the give-up
 * timer. That is how the mark at the head of the rail came to lay a progress
 * bar across the dashboard when you were already on the dashboard, and it is
 * the same bar the active row of the sidebar, or a filter re-applied at the
 * value it already had, has always drawn.
 *
 * This is the rule `refresh` is left out of `useRouter` for, applied one step
 * earlier: don't arm for a navigation that goes nowhere.
 *
 * The comparison ignores the hash deliberately. A hash-only change asks the
 * server for nothing and leaves `pathname` and `search` exactly where they
 * were, so it has the same problem and wants the same answer.
 *
 * `locale` is the locale being navigated *to*, never simply the page's own:
 * switching language replaces the current path under a different prefix, so it
 * arrives here as an unchanged locale-less pathname and a genuinely different
 * address. Reading the active locale instead would take the bar off the
 * slowest navigation in the app.
 */
function leadsNowhere(href: PathnameArgs['href'], locale: PathnameArgs['locale']): boolean {
  const target = new URL(getPathname({ href, locale }), window.location.origin);

  return (
    target.origin === window.location.origin &&
    target.pathname === window.location.pathname &&
    target.search === window.location.search
  );
}

/**
 * `Link`, with the progress bar armed on the way out.
 *
 * Everything the app navigates with comes through here, which is the only
 * reason the bar needs no cooperation from any call site: there is one `Link`
 * in this product and it is this one.
 *
 * ## Why `onNavigate` and not a click handler
 *
 * `onNavigate` is Next's own hook into a client-side navigation, and it fires
 * *only* for the clicks that actually are one. A modified click, a
 * middle-click, `target="_blank"`, `download`, an off-site href and a click
 * something upstream has already cancelled all reach `onClick` and none of them
 * reach here — see `linkClicked` in `next/dist/client/app-dir/link.js`. Written
 * as an `onClick` this would have to re-derive every one of those rules, and be
 * wrong about one of them, to start a bar for a navigation that never happens
 * and never ends.
 *
 * A caller's own `onNavigate` still runs first and can still cancel: if it does,
 * no bar is armed, because nothing is going anywhere.
 */
export type LinkProps = ComponentProps<typeof IntlLink> & {
  /**
   * Prefetch the whole route — data included — when the pointer lands on it,
   * instead of only as far as its `loading.tsx`. See the rail in `sidebar.tsx`,
   * which is the one list in the product it is turned on for.
   *
   * **Declared here because next-intl's prop type does not carry it.** That
   * type is a hand-written `Omit` of `next/link`'s and predates the option, so
   * TypeScript rejects a prop the component forwards perfectly well — `BaseLink`
   * spreads everything it is not itself interested in straight through. The
   * cast below is the whole of the workaround; drop both when next-intl catches
   * up.
   */
  unstable_dynamicOnHover?: boolean;
};

export function Link({ onNavigate, ...props }: LinkProps) {
  const activeLocale = useLocale();

  return (
    <IntlLink
      {...(props as ComponentProps<typeof IntlLink>)}
      onNavigate={(event) => {
        let cancelled = false;

        onNavigate?.({
          preventDefault: () => {
            cancelled = true;
            event.preventDefault();
          },
        });

        if (cancelled) return;
        // `props.locale` first: a link that changes language is going somewhere
        // even when its href is the path already on screen. See `leadsNowhere`.
        if (leadsNowhere(props.href as PathnameArgs['href'], props.locale ?? activeLocale)) return;

        startNavigationProgress();
      }}
    />
  );
}

/**
 * `useRouter`, with the progress bar armed on `push` and `replace`.
 *
 * A quarter of the navigations in the staff app are programmatic — a filter
 * being applied, a form landing on the record it just created, the language
 * switcher — and they are the *slowest* ones, because none of them are
 * prefetched the way a link in the viewport is. Leaving them out would have put
 * the bar on the navigations that least need it.
 *
 * `refresh` is deliberately untouched. It re-runs the current route in place
 * without going anywhere, and `NavigationProgressWatcher` finishes the bar on
 * the address changing — which a refresh never does. It would be a bar that
 * only ever ended by timing out.
 */
export function useRouter() {
  const router = useIntlRouter();
  const activeLocale = useLocale();

  return useMemo(
    () => ({
      ...router,
      /*
        The navigation still happens either way — only the bar is withheld when
        the destination is the address already on screen. `options.locale` is
        what the language switcher passes, and it is the difference between
        "the same path" and "the same address"; see `leadsNowhere`.
      */
      push: ((href, options) => {
        if (!leadsNowhere(href as PathnameArgs['href'], options?.locale ?? activeLocale)) {
          startNavigationProgress();
        }
        router.push(href, options);
      }) as typeof router.push,
      replace: ((href, options) => {
        if (!leadsNowhere(href as PathnameArgs['href'], options?.locale ?? activeLocale)) {
          startNavigationProgress();
        }
        router.replace(href, options);
      }) as typeof router.replace,
    }),
    [router, activeLocale],
  );
}
