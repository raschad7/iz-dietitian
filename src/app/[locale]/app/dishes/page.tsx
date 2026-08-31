import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { AddDishButton } from '@/features/weekly-plans/components/add-dish-button';
import { PageHeader } from '@/components/layout/page-header';
import { DishFilters } from '@/features/weekly-plans/components/dish-filters';
import { DishList, type DishCardData } from '@/features/weekly-plans/components/dish-list';
import { DishPagination } from '@/features/weekly-plans/components/dish-pagination';
import { parseOwnerFilter } from '@/features/weekly-plans/catalog-ownership';
import { nutritionCategory, roundForDisplay } from '@/features/weekly-plans/nutrition';
import { listDishes } from '@/features/weekly-plans/queries';
import { DISH_TAGS } from '@/features/weekly-plans/schema';
import { membersOf } from '@/lib/enum';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    mealType?: string;
    tags?: string;
    hp?: string;
    owner?: string;
    page?: string;
    hidden?: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'dishes' });
  return { title: t('title') };
}

export default async function DishesPage({ params, searchParams }: PageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { q, mealType, tags: tagsParam, hp, owner: ownerParam, page, hidden } = await searchParams;
  const showHidden = hidden === '1';
  const highProtein = hp === '1';
  // Narrowed against the known set: a hand-edited `?owner=whatever` degrades to no
  // filter rather than being trusted.
  const owner = parseOwnerFilter(ownerParam);

  // Narrowed against the enum: a hand-edited `?tags=made_up` degrades to no filter
  // rather than being trusted, the same way `page` degrades below.
  const tags = membersOf(DISH_TAGS, (tagsParam ?? '').split(',').filter(Boolean));

  // A hand-edited query string degrades to page 1 rather than throwing a 500.
  const parsedPage = Number(page);
  const currentPage = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const [result, t] = await Promise.all([
    listDishes({ clinicId, q, mealType, tags, highProtein, owner, page: currentPage, hiddenOnly: showHidden }),
    getTranslations('dishes'),
  ]);

  const items: DishCardData[] = result.items.map((dish) => ({
    id: dish.id,
    nameAr: dish.nameAr,
    nameEn: dish.nameEn,
    mealTypes: dish.mealTypes,
    tags: dish.tags,
    kcal: roundForDisplay('kcal', dish.baseKcal),
    carbs: roundForDisplay('carbs', dish.totals.carbs.value),
    protein: roundForDisplay('protein', dish.totals.protein.value),
    // Derived from the recipe here rather than read off the row: `high_protein`
    // is a computed category, and the filter above narrows on the same function,
    // so the chip and the filter can never disagree.
    highProtein: nutritionCategory(dish.totals) === 'high_protein',
    isSystem: dish.clinicId === null,
    hidden: dish.hidden,
  }));

  // `showHidden` counts. It is the one switch that can empty this page on its
  // own — a clinic that has hidden nothing turns it on and gets no rows — and
  // the empty state has to say "nothing matched" rather than "your catalog is
  // empty", which is what an unfiltered empty list means.
  const filtered =
    Boolean(q) || Boolean(mealType) || tags.length > 0 || highProtein || Boolean(owner) || showHidden;

  return (
    /*
      The page fills the shell and does not scroll; the list does, inside itself,
      so the toolbar stays put over a long catalog. Below `md` the page scrolls as
      a whole.
    */
    <div className="flex flex-col gap-4 text-start md:h-full md:min-h-0">
      <div className="flex shrink-0 flex-col gap-4">
        {/* No subtitle. It counted the catalog and then explained, every time
            the page was opened, that this is what the generator draws from —
            a sentence that is true once and furniture from then on. The count
            is already at the foot of the list, beside the pager, where it
            belongs. */}
        <PageHeader locale={locale} title={t('title')} clinicId={clinicId} />

        {/* Add sits *in* the toolbar rather than up beside the title: everything
            you do to this catalog — search it, narrow it, add to it — is now one
            row of controls, and the heading is just a heading. */}
        <DishFilters
          q={q}
          mealType={mealType}
          tags={tags}
          highProtein={highProtein}
          owner={owner}
          showHidden={showHidden}
        >
          <AddDishButton locale={locale} />
        </DishFilters>
      </div>

      {/*
        The list and its pager are one block, with no gap between them.

        The pager already draws its own rule across the top, and that rule is
        what closes the list: a row clipped by the scroll port then runs into a
        line, the way the last row of any paged table does. With the page's
        `gap-4` between them it ran into a band of white instead, which read as
        the screen having stopped early rather than as a list with more in it.
      */}
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DishList locale={locale} items={items} filtered={filtered} />

        <DishPagination
          result={result}
          q={q}
          mealType={mealType}
          tags={tagsParam}
          hp={hp}
          owner={ownerParam}
          hidden={hidden}
        />
      </div>
    </div>
  );
}
