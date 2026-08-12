import { redirect } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  redirect(`/${locale}/app/settings/profile`);
}
