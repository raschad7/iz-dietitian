import { redirect } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

type ClientPortalPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * The old Portal Access tab.
 *
 * It is the profile's **Security** view now — the same `PortalCredentialsCard`,
 * rendered once, beside the identity panel that the rest of the record shares.
 * The route stays as a redirect rather than being deleted: it was a tab in the
 * record's own bar for the whole life of the feature, and a bookmark or a link
 * in a message should land on the card it meant rather than on a 404.
 *
 * `redirect` needs the locale segment spelled out — it takes a real path, not
 * one of the localised router's hrefs.
 */
export default async function ClientPortalPage({ params }: ClientPortalPageProps) {
  const locale = await resolveLocale(params);
  const { clientId } = await params;

  redirect(`/${locale}/app/clients/${clientId}?tab=security`);
}
