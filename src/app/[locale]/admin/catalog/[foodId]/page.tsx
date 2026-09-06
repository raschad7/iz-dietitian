import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { DismissibleCallout } from '@/components/ui/dismissible-callout';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { getSharedFood } from '@/features/admin/catalog';
import { SharedFoodForm } from '@/features/admin/components/shared-food-form';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { formatNumber } from '@/lib/format';

type FoodPageProps = {
  params: Promise<{ locale: string; foodId: string }>;
};

export async function generateMetadata({ params }: FoodPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { foodId } = await params;
  const [food, t] = await Promise.all([
    getSharedFood(foodId),
    getTranslations({ locale, namespace: 'admin.catalog' }),
  ]);

  return { title: food?.nameEn ?? t('notFound') };
}

/**
 * One shared food: what a person curates, beside what a script derives.
 *
 * The split is the point of the screen. Names, category, state and availability
 * are in a form; nutrition, portions and provenance are printed as facts. A
 * reader should be able to tell at a glance which half they can change, without
 * discovering it by typing into a box that does nothing.
 */
export default async function SharedFoodPage({ params }: FoodPageProps) {
  const locale = await resolveLocale(params);
  const { foodId } = await params;

  const [t, tAdmin, food] = await Promise.all([
    getTranslations('admin.catalog'),
    getTranslations('admin'),
    getSharedFood(foodId),
  ]);

  if (!food) notFound();

  const macros = [
    ['kcal', food.kcal],
    ['protein', food.protein],
    ['carbs', food.carbs],
    ['fat', food.fat],
  ] as const;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 text-start">
      <div className="space-y-3">
        <Link
          href="/admin/catalog"
          className="inline-flex items-center gap-1 text-body-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <Icon name="back" className="size-4" />
          {t('back')}
        </Link>

        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{food.nameAr}</h1>
          <Badge variant={food.isActive ? 'muted' : 'attention'}>
            {food.isActive ? t('status.active') : t('status.inactive')}
          </Badge>
        </header>

        <p className="text-body-sm text-muted-foreground">
          <code>{food.slug}</code> · {t('detail.usedBy', { count: formatNumber(locale, food.usedBy) })}
        </p>
      </div>

      <DismissibleCallout
        tone="attention"
        /*
          A standing operational reminder, identical on both catalog screens and
          on every visit: edits here are database-only until somebody runs the
          export. That is exactly the shape of notice worth a dismiss control —
          it never resolves itself, so without one it is a permanent amber band
          across a screen the operator uses daily and learns to look past. The id
          is the notice, not the screen, so putting it away here puts it away on
          the food detail too; it says the same sentence.
        */
        noticeId="admin.catalog.exportNotice"
        dismissLabel={tAdmin('dismissNotice')}
      >
        {t('exportNotice')}
      </DismissibleCallout>

      <section className="space-y-3">
        <h2 className="font-heading text-heading-sm font-semibold">{t('detail.curated')}</h2>
        <SharedFoodForm food={food} locale={locale} />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-heading-sm font-semibold">{t('detail.derived')}</h2>
        <p className="max-w-3xl text-body-sm text-muted-foreground">{t('derivedNotice')}</p>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 p-4">
              <h3 className="text-caption text-muted-foreground">{t('detail.nutrition')}</h3>
              <dl className="grid grid-cols-2 gap-2 text-body-sm">
                {macros.map(([key, value]) => (
                  <div key={key} className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="tabular-nums">{formatNumber(locale, value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-caption text-muted-foreground">
                {t('detail.source')}: {food.sourceType}
                {food.sourceRef ? ` · ${food.sourceRef}` : ''}
              </p>
              {food.sourceNote ? (
                <p className="text-caption text-muted-foreground">{food.sourceNote}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <h3 className="text-caption text-muted-foreground">{t('detail.portions')}</h3>
                {food.portionList.length === 0 ? (
                  <p className="text-body-sm text-muted-foreground">{t('detail.noPortions')}</p>
                ) : (
                  <ul className="text-body-sm">
                    {food.portionList.map((portion) => (
                      <li key={portion.id} className="flex items-baseline justify-between gap-2">
                        <span>
                          {portion.labelAr} · {portion.labelEn}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(locale, portion.grams)} g
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-caption text-muted-foreground">{t('detail.aliases')}</h3>
                {food.aliasList.length === 0 ? (
                  <p className="text-body-sm text-muted-foreground">{t('detail.noAliases')}</p>
                ) : (
                  <p className="flex flex-wrap gap-1">
                    {food.aliasList.map((alias) => (
                      <Badge key={alias.id} variant="outline">
                        {alias.name}
                      </Badge>
                    ))}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
