import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PlanForm } from '@/features/meal-plans/components/plan-form';
import { listPlannableClients } from '@/features/meal-plans/queries';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type NewMealPlanPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: NewMealPlanPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'mealPlans' });
  return { title: t('createTitle') };
}

export default async function NewMealPlanPage({ params }: NewMealPlanPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const [clients, t] = await Promise.all([
    listPlannableClients(clinicId),
    getTranslations('mealPlans'),
  ]);

  return (
    <div className="space-y-6 text-start">
      <h2 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h2>

      {/* A plan needs someone to be for; without a client there is nothing to build. */}
      {clients.length === 0 ? (
        <div className="space-y-4 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('noClients')}</p>
          <Link href="/app/clients/new" className={buttonVariants({ size: 'sm' })}>
            {t('addClient')}
          </Link>
        </div>
      ) : (
        <PlanForm locale={locale} clients={clients} />
      )}
    </div>
  );
}
