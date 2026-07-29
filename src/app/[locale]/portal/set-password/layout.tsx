import type { ReactNode } from 'react';

import { resolveLocale } from '@/i18n/params';
import { requireClientSession } from '@/lib/session';

type SetPasswordLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Deliberately its own layout, NOT nested under `portal/layout.tsx`.
 *
 * That layout redirects here whenever `mustChangePassword` is true. If this
 * page sat inside it, the same check would fire again on this page's own
 * render and redirect to itself forever, locking every client out
 * permanently. This layout still authenticates the request — a client must be
 * signed in to reach this page — it just never performs the flag check.
 */
export default async function SetPasswordLayout({ children, params }: SetPasswordLayoutProps) {
  const locale = await resolveLocale(params);

  await requireClientSession(locale);

  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}
