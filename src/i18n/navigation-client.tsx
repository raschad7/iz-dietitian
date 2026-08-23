'use client';

import { useMemo, type ComponentProps } from 'react';

import { startNavigationProgress } from '@/components/layout/navigation-progress';

import { IntlLink, useIntlRouter } from './navigation-base';

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

        if (!cancelled) startNavigationProgress();
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

  return useMemo(
    () => ({
      ...router,
      push: ((href, options) => {
        startNavigationProgress();
        router.push(href, options);
      }) as typeof router.push,
      replace: ((href, options) => {
        startNavigationProgress();
        router.replace(href, options);
      }) as typeof router.replace,
    }),
    [router],
  );
}
