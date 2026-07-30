import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { PlanForm } from '@/features/meal-plans/components/plan-form';
import { getPlan, listPlannableClients } from '@/features/meal-plans/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type EditMealPlanPageProps = {
  params: Promise<{ locale: string; planId: string }>;
};

export async function generateMetadata({ params }: EditMealPlanPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'mealPlans' });
  return { title: t('editTitle') };
}

export default async function EditMealPlanPage({ params }: EditMealPlanPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { planId } = await params;
  const plan = await getPlan(clinicId, planId);

  if (!plan) {
    notFound();
  }

  const [clients, t] = await Promise.all([
    listPlannableClients(clinicId),
    getTranslations('mealPlans'),
  ]);

  return (
    <div className="space-y-6 text-start">
      <h2 className="text-2xl font-semibold tracking-tight">{t('editTitle')}</h2>

      <PlanForm
        locale={locale}
        clients={clients}
        plan={{ id: plan.id, title: plan.title, notes: plan.notes, clientId: plan.clientId }}
      />
    </div>
  );
}
