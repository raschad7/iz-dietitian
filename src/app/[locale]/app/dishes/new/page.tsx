import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { DishEditor } from '@/features/weekly-plans/components/dish-editor';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'dishEditor.editor' });
  return { title: t('pageTitle') };
}

export default async function NewDishPage({ params }: PageProps) {
  const locale = await resolveLocale(params);
  await requireStaffClinic(locale);

  const t = await getTranslations('dishEditor.editor');

  return (
    <div className="flex flex-col gap-6 text-start">
      <div>
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-body-sm text-muted-foreground">{t('pageSubtitle')}</p>
      </div>

      <DishEditor locale={locale} />
    </div>
  );
}
