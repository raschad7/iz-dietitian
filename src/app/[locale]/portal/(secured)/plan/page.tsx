import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { db } from '@/db';
import { clients } from '@/db/schema';
import { PortalPlan } from '@/features/weekly-plans/components/portal-plan';
import { getPublishedBoard } from '@/features/weekly-plans/queries';
import { resolveLocale } from '@/i18n/params';
import { requireClientSession } from '@/lib/session';
import { eq } from 'drizzle-orm';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portalPlan' });
  return { title: t('title') };
}

/**
 * The client's published plan.
 *
 * Authorisation is by ownership, not by clinic: a portal session carries a user id,
 * and the plan is reachable because `clients.user_id` points at it. Reaching for a
 * clinic id here would mean trusting a value the client's session does not have.
 */
export default async function PortalPlanPage({ params }: PageProps) {
  const locale = await resolveLocale(params);
  const session = await requireClientSession(locale);

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.userId, session.user.id))
    .limit(1);

  const board = client ? await getPublishedBoard(client.id) : null;

  const t = await getTranslations('portalPlan');

  // No published plan is the ordinary state for a new client, not an error.
  if (!board) {
    return (
      <div className="space-y-2 text-start">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('empty')}</p>
      </div>
    );
  }

  return <PortalPlan board={board} />;
}
