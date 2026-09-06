import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ADMIN_NAV, ADMIN_NAV_ICONS } from '@/components/layout/admin-nav';
import { DesktopScrollbars } from '@/components/layout/desktop-scrollbars';
import { AppShell } from '@/components/layout/sidebar';
import { GlobalSearch } from '@/features/admin/components/global-search';
import { resolveLocale } from '@/i18n/params';
import { requireAdminSession } from '@/lib/session';

type AdminLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * The platform area — one operator, above every clinic.
 *
 * Deliberately the thinnest of the three shells in the product. The staff
 * layout carries a service worker, PWA metadata, a zoom lock, a command palette
 * and a guided tour; the portal carries its own set. None of that belongs here:
 * this area is opened on a laptop by the person who runs the deployment, not
 * installed to a phone by someone using it all day. Every one of those pieces
 * is a thing to keep working in two languages for a single reader who does not
 * need it.
 *
 * What it does keep is `DesktopScrollbars`, because the screens under it are
 * long tables and a scrollbar you can see is the point of that opt-in.
 *
 * ## The search bar is in the layout, not on a screen
 *
 * See `GlobalSearch`. Three per-table search fields on three screens meant an
 * operator had to know which table an address belonged to before they could look
 * it up; this crosses all three and is in the same place every time.
 *
 * ## Screens here run full width
 *
 * The staff app centres its content because a dietitian reads a client's record
 * like a document. An operator reads tables — twelve columns of clinics against
 * their health — and a centred `max-w-5xl` column on a 27-inch monitor throws
 * away the half of the screen the extra columns would have gone in. Individual
 * screens still cap themselves where the content is genuinely a document; the
 * frame no longer decides it for them.
 */

/**
 * No `manifest`, no `appleWebApp`, no icons — see the note above.
 *
 * `robots` is the one addition. Nothing links here and the guard turns away
 * every anonymous request anyway, but a crawler that finds the path should be
 * told plainly rather than left to infer it from a redirect.
 */
export async function generateMetadata({ params }: Omit<AdminLayoutProps, 'children'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'admin' });

  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const locale = await resolveLocale(params);

  /*
    The authoritative guard for the whole platform area, and the only guard in
    the application that grants a view across clinics.

    Note what is NOT here: no `isClinicOnboardingComplete` redirect, and no
    `clinicId`. An admin belongs to no clinic — that is the point — so there is
    no onboarding to complete and nothing for a tenant-scoped query to be
    scoped by. See `requireAdminSession`.
  */
  const session = await requireAdminSession(locale);

  const t = await getTranslations({ locale, namespace: 'admin' });

  return (
    <>
      <DesktopScrollbars />

      <AppShell
        items={ADMIN_NAV}
        title={t('railTitle')}
        user={{ name: session.user.name, email: session.user.email, locale }}
        icons={ADMIN_NAV_ICONS}
      >
        {/*
          The same scrolling contract as the staff shell: `.q-app-shell` in
          globals.css owns the fixed-height frame, and `data-slot="shell-scroll"`
          is how this element claims the region that scrolls inside it.
        */}
        <main data-slot="shell-scroll" className="min-w-0 p-3 md:p-5">
          <div className="mx-auto w-full max-w-[1600px] space-y-5">
            {/*
              The search sits above the screen's own heading rather than beside
              it. Beside would make it part of whatever screen is open, which is
              the opposite of what it does — and it would move between screens
              whose headings are different lengths in two languages.
            */}
            <GlobalSearch locale={locale} />

            {children}
          </div>
        </main>
      </AppShell>
    </>
  );
}
