'use client';

import { useTranslations } from 'next-intl';

import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { deletePlanAction } from '@/features/meal-plans/actions';
import { type Locale } from '@/i18n/routing';

/** Deleting a plan takes its meals and items with it, so it asks first. */
export function DeletePlanButton({
  locale,
  planId,
  title,
}: {
  locale: Locale;
  planId: string;
  title: string;
}) {
  const t = useTranslations('mealPlans');
  const tCommon = useTranslations('common');

  return (
    <form action={deletePlanAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="planId" value={planId} />
      <ConfirmSubmitButton
        label={tCommon('delete')}
        confirmMessage={t('actions.confirmDeletePlan', { title })}
        variant="destructive"
      />
    </form>
  );
}
