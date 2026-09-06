'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CATALOG_FOOD_CATEGORIES, CATALOG_FOOD_STATES } from '@/db/schema/catalog-foods';
import type { Locale } from '@/i18n/routing';

import { saveSharedFoodAction, type AdminActionState } from '../actions';
import type { SharedFoodDetail } from '../catalog';

/**
 * The curated half of a shared food.
 *
 * **There is no nutrition field, and that is the design.** `db:build-catalog`
 * regenerates kcal, macros and portions from `data/usda-sr-legacy.ndjson`, so a
 * box here would offer an edit that the next run of that script silently
 * reverts. The derived values are shown beside this form, read-only, and the
 * server action's schema does not accept them either — a field added to this
 * markup later would still be refused.
 *
 * A plain `<select>` rather than the product's `Select`: this form has two of
 * them, both over a closed list of unstyled words, and the native control is
 * keyboard- and screen-reader-correct in both directions without a portal.
 */
export function SharedFoodForm({ food, locale }: { food: SharedFoodDetail; locale: Locale }) {
  const t = useTranslations('admin.catalog.form');
  const tErrors = useTranslations('admin.catalog.errors');

  const [state, formAction] = useActionState<AdminActionState, FormData>(saveSharedFoodAction, {
    status: 'idle',
  });

  const selectClass =
    'h-10 w-full rounded-md border border-input bg-background px-3 text-body-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="foodId" value={food.id} />
      <input type="hidden" name="locale" value={locale} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label htmlFor="nameAr">{t('nameAr')}</Label>
          <Input id="nameAr" name="nameAr" defaultValue={food.nameAr} required maxLength={120} dir="rtl" />
        </Field>

        <Field>
          <Label htmlFor="nameEn">{t('nameEn')}</Label>
          <Input id="nameEn" name="nameEn" defaultValue={food.nameEn} required maxLength={120} dir="ltr" />
        </Field>

        <Field>
          <Label htmlFor="category">{t('category')}</Label>
          <select id="category" name="category" defaultValue={food.category} className={selectClass}>
            {CATALOG_FOOD_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <Label htmlFor="state">{t('state')}</Label>
          <select id="state" name="state" defaultValue={food.state} className={selectClass}>
            {CATALOG_FOOD_STATES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" name="isActive" defaultChecked={food.isActive} className="size-4" />
        {t('isActive')}
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit">{t('save')}</Button>

        {state.status === 'ok' ? (
          <span role="status" className="text-body-sm text-muted-foreground">
            {t('saved')}
          </span>
        ) : null}

        {state.status === 'error' ? (
          <span role="alert" className="text-body-sm text-status-attention-fg">
            {state.message === 'notFound' ? tErrors('notFound') : tErrors('invalid')}
          </span>
        ) : null}
      </div>
    </form>
  );
}
