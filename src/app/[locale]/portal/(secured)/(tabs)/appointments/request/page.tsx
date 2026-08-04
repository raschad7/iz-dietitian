import { redirect } from 'next/navigation';

import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type RequestPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Closed. Every visit lands back on the appointments list.
 *
 * This route used to serve all three asks a client could make — book, move,
 * cancel — behind one `?kind=`. None of them are the client's any more:
 * appointments are made and changed by the dietitian, so nothing in the portal
 * links here and `requestAppointmentAction` refuses whatever reaches it.
 *
 * The route is kept as a redirect rather than deleted so that an old link, a
 * bookmark or a WhatsApp message from before the change lands somewhere useful
 * instead of on a 404. `RequestForm` and `loadRequestPage` are untouched beneath
 * it: the capability is switched off, not dismantled.
 */
export default async function RequestAppointmentPage({ params }: RequestPageProps) {
  const locale = await resolveLocale(params);

  // The guard still runs first: a signed-out visitor belongs at the sign-in
  // page, not redirected into a portal they cannot open.
  await requirePortalClient(locale);

  redirect(`/${locale}/portal/appointments`);
}
