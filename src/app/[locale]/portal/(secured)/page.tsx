import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';

import { db } from '@/db';
import { clients } from '@/db/schema';
import { PortalPlan } from '@/features/weekly-plans/components/portal-plan';
import { getPublishedBoard } from '@/features/weekly-plans/queries';
import { resolveLocale } from '@/i18n/params';
import { requireClientSession } from '@/lib/session';

type PortalPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PortalPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portalPlan' });
  return { title: t('title') };
}

/**
 * The portal landing page IS the client's plan.
 *
 * It was briefly a separate `/portal/plan` route behind a greeting, which meant a
 * client had no way to reach it — the portal has no navigation, so the plan was
 * unreachable in practice. The portal does one thing today; when it does a second,
 * that is when it earns a nav and a landing page.
 *
 * Authorisation is by ownership, not by clinic: a portal session carries a user id,
 * and the plan is reachable because `clients.user_id` points at it. Reaching for a
 * clinic id here would mean trusting a value the client's session does not have.
 */
export default async function PortalPage({ params }: PortalPageProps) {
  const locale = await resolveLocale(params);
  const session = await requireClientSession(locale);

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.userId, session.user.id))
    .limit(1);

  const board = client ? await getPublishedBoard(client.id) : null;

  if (board) return <PortalPlan board={board} />;

  const t = await getTranslations('portalPlan');

  return (
    <div className="space-y-2 text-start">
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">
        {/*
          Two different problems, two different messages. "No plan yet" is the
          ordinary state for a new client; an account with no client record behind it
          is a setup mistake, and telling the client to wait for a plan that will
          never arrive would send them to the wrong person.
        */}
        {client ? t('empty') : t('notLinked')}
      </p>
    </div>
  );
}
