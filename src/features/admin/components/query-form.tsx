'use client';

import { type FormEvent, type ReactNode } from 'react';

import { useRouter } from '@/i18n/navigation';

/**
 * A GET form that navigates the router instead of reloading the document.
 *
 * ## The bug this exists for
 *
 * Every control on this area that changes the URL was a plain `method="get"`
 * form or a bare `<a href>`: the range picker, the global search box, the filter
 * strips, the pagers. Each one is a **document navigation** — the browser throws
 * the running page away and asks the server for a fresh one — and a fresh
 * document with no `Cache-Control` header is, to `SplashLaunchGate`, the
 * application starting. So changing a filter played the launch screen. Full
 * green tile, mark hopping across it, two seconds, every time an operator
 * pressed "30 days".
 *
 * The splash was the visible half. The other half is that a filter change was
 * paying for a cold document — fonts, the whole client bundle, the shell — to
 * redraw a table.
 *
 * ## Why the form is still a form
 *
 * `onSubmit` is intercepted and turned into `router.push`, so the navigation is
 * client-side, the shell survives, and the launch screen is never re-evaluated.
 * With JavaScript off, none of that runs and the browser submits the form the
 * way it always did — same URL, same result, one document load. The handler is
 * an accelerator, not the mechanism, which is the same contract `AdminToolbar`
 * already documented for its selects.
 *
 * ## Two paths, and they are not the same string
 *
 * `action` is what the *browser* posts to, so it carries the locale prefix;
 * `path` is what `router.push` takes, and `@/i18n/navigation` adds the prefix
 * itself. Passing the prefixed path to the router would produce `/ar/ar/admin`.
 */
export function QueryForm({
  path,
  locale,
  className,
  role,
  children,
  onNavigate,
}: {
  /** Locale-less, e.g. `/admin/ai`. The router adds the prefix. */
  path: string;
  locale: string;
  className?: string;
  /** `search` on the box in the layout; the filter strips are plain forms. */
  role?: 'search';
  children: ReactNode;
  /** Fires once the push has been issued — closing a sheet, say. */
  onNavigate?: () => void;
}) {
  const router = useRouter();

  return (
    <form
      method="get"
      action={`/${locale}${path}`}
      role={role}
      className={className}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        router.push(hrefFor(path, event.currentTarget, submitterOf(event)));
        onNavigate?.();
      }}
    >
      {children}
    </form>
  );
}

/**
 * The button that submitted, when there was one.
 *
 * React's synthetic event does not carry `submitter`; the native one does, and
 * this is the only place in the app that needs it. It matters because the range
 * picker's segments *are* submit buttons carrying `name="range" value="90d"` —
 * `new FormData(form)` does not include any of them.
 */
export function submitterOf(event: FormEvent<HTMLFormElement>): HTMLElement | null {
  const native = event.nativeEvent;

  return native instanceof SubmitEvent ? native.submitter : null;
}

/**
 * The address a submit would have gone to.
 *
 * Empty values are dropped rather than written as `?q=`, so the bare path is
 * what a cleared filter produces — the same URL the "clear" link points at, and
 * one address for one screen. Exported because `AdminToolbar` submits itself on
 * a select change and needs the same arithmetic.
 */
export function hrefFor(path: string, form: HTMLFormElement, submitter: HTMLElement | null): string {
  const data = new FormData(form);

  if (
    (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
    submitter.name
  ) {
    data.set(submitter.name, submitter.value);
  }

  const search = new URLSearchParams();

  for (const [name, value] of data.entries()) {
    if (typeof value === 'string' && value.trim() !== '') search.append(name, value);
  }

  const query = search.toString();

  return query ? `${path}?${query}` : path;
}
