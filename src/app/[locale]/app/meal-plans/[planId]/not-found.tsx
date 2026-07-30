import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default async function MealPlanNotFound() {
  const t = await getTranslations('mealPlans');

  return (
    <div className="space-y-4 text-start">
      <h2 className="text-2xl font-semibold tracking-tight">{t('notFound')}</h2>
      <p className="text-muted-foreground">{t('notFoundDescription')}</p>
      <Link href="/app/meal-plans" className={buttonVariants({ variant: 'outline' })}>
        {t('backToList')}
      </Link>
    </div>
  );
}
