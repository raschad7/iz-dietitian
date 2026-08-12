import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { getClient } from '@/features/clients/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ClientLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * The chrome a client's record shares: the way back.
 *
 * **The tab bar left this file.** The record's sections used to be five routes
 * with a strip of link tabs here; they are four views of one page now, switched
 * by the record's own tablist, and every one of the old routes redirects into
 * it. Two bars — link tabs here and panel tabs a row below — was the arrangement
 * that made this screen ask twice which section you were in.
 *
 * **The identity strip left with it.** The avatar, the name and the archived
 * badge are the identity panel's subject, and that panel is beside every view; a
 * second portrait directly above it was the same person drawn twice on one
 * screen. Edit and the overflow menu followed it down there — see
 * `ClientRecordActions`.
 *
 * What remains is one breadcrumb and the record under it. Fetching the client
 * here rather than in the page means a bad id 404s once, before any of the
 * record's reads run.
 *
 * `h-full`/`min-h-0` on the shell, with only the middle strip scrolling: the
 * same shape `/app/calendar` uses, and it is what lets the record's views fill a
 * bounded parent and scroll their own content rather than the page.
 */
export default async function ClientLayout({ children, params }: ClientLayoutProps) {
  const locale = await resolveLocale(params);
  const { session, clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);

  // TEMP DEBUG — remove once the client-detail 404 is root-caused.
  console.log('[client-layout-debug]', {
    userEmail: session.user.email,
    sessionClinicId: clinicId,
    requestedClientId: clientId,
    found: Boolean(client),
  });

  if (!client) {
    notFound();
  }

  const t = await getTranslations('clients');

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 text-start">
      {/*
        The way back, and nothing else. Edit and the overflow menu were here for
        one release; they are at the foot of the identity panel now, which is the
        column they act on — see `ClientRecordActions`.
      */}
      <Link
        href="/app/clients"
        className="inline-flex w-fit items-center gap-1 text-body-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <Icon name="chevronStart" className="size-3.5" />
        {t('backToList')}
      </Link>

      {/*
        ⚠ **The padding is what stops the cards looking sliced.** Setting
        `overflow-y` to anything but `visible` forces `overflow-x` to compute to
        `auto` as well, so this box clips on all four edges — and a `Card` draws
        a 1px ring plus an olive-tinted shadow *outside* its border box. Flush
        against the clip, that ring vanished on whichever edge the card touched:
        the inline edges always, the block-start edge at rest, the block-end edge
        once scrolled. The result read as cards with a side missing.

        `pb-6` rather than `pb-1` because the block-end edge is also where the
        last card's shadow lands when the list is scrolled to the bottom, and a
        shadow needs more room than a hairline.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pt-1 pb-6">{children}</div>
    </div>
  );
}
