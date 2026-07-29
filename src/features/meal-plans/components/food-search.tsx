import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { ListFoodsInput } from '@/features/meal-plans/schema';

/**
 * A plain GET form, like `ClientSearch`. Submitting it puts the filters in the
 * URL, which is what the page reads — so a filtered view of the food table is a
 * shareable address and this component ships no client JavaScript at all.
 */
export function FoodSearch({
  input,
  categories,
}: {
  input: ListFoodsInput;
  categories: string[];
}) {
  const t = useTranslations('foods');
  const tCommon = useTranslations('common');

  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <Input
          name="q"
          type="search"
          defaultValue={input.q ?? ''}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
      </div>

      <Select
        name="category"
        defaultValue={input.category ?? ''}
        aria-label={t('fields.category')}
        className="w-56"
      >
        <option value="">{t('allCategories')}</option>
        {categories.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>

      <Button type="submit" variant="outline">
        {tCommon('search')}
      </Button>
    </form>
  );
}
