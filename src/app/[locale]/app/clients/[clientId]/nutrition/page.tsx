import { redirect } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

type ClientNutritionPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * The old Nutrition tab.
 *
 * It is the record's **Nutrition** view now — the same `ClientNutrition`, and
 * the same intake dialog behind it. The route stays as a redirect for the reason
 * the other three do: it was an address in the record's tab bar, and the weekly
 * planner still links people here from its own profile shortcut.
 */
export default async function ClientNutritionPage({ params }: ClientNutritionPageProps) {
  const locale = await resolveLocale(params);
  const { clientId } = await params;

  redirect(`/${locale}/app/clients/${clientId}?tab=nutrition`);
}
