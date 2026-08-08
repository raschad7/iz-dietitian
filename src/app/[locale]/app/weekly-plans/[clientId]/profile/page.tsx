import { redirect } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

type PageProps = { params: Promise<{ locale: string; clientId: string }> };

/**
 * The nutrition profile form used to live here, reachable only from the
 * planner's context panel — and it could write only the half of a client's
 * intake that lived in `client_nutrition_profiles`. It is the client's own
 * Nutrition tab now, which writes both tables.
 *
 * A redirect rather than a deletion: this address is in bookmarks, in the app's
 * own history, and in `docs/superpowers/specs/`. It costs one file to keep them
 * all working.
 *
 * No session guard here on purpose. This resolves to a route that has one — the
 * clients layout calls `requireStaffClinic` — and adding a second would mean a
 * signed-out visitor was bounced to a login that then sent them somewhere else
 * again. The redirect leaks nothing: the target 404s for a client of another
 * clinic exactly as it would if it had been typed directly.
 */
export default async function NutritionProfileRedirect({ params }: PageProps) {
  const locale = await resolveLocale(params);
  const { clientId } = await params;

  redirect(`/${locale}/app/clients/${clientId}/nutrition`);
}
