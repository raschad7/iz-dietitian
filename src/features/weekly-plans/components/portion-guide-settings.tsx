import { getTranslations } from 'next-intl/server';

import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { SettingsSection } from '@/features/settings/components/settings-section';
import type { Locale } from '@/i18n/routing';

import { localizedName } from '../food-display';
import { groupPortionGuide, type PortionGuideEntry } from '../portion-guide';

/**
 * What a spoon, a loaf and a حبة weigh in this clinic's plans.
 *
 * ## Read-only, and generated
 *
 * Every number here is `catalog_food_portions` rendered — never a second copy.
 * A hand-kept table of measurements would drift from the plans within a month,
 * and a reference that disagrees with the thing it describes is worse than no
 * reference. Because this page can only *show*, it cannot disagree.
 *
 * ## Why it earns a place in Settings
 *
 * A dietitian writing «٦ ملاعق أرز» has one question — what is the app
 * counting? — and until now the only way to answer it was to open the dish
 * editor and add the ingredient. The answer belongs where the clinic's other
 * standing decisions are.
 *
 * It sits under Clinic beside the nutrition rules rather than taking a tab of
 * its own, on the rule that page already follows: a tab is a place somebody has
 * to know to look, and one table does not earn one.
 */
export async function PortionGuideSettings({
  locale,
  entries,
}: {
  locale: Locale;
  entries: readonly PortionGuideEntry[];
}) {
  const t = await getTranslations('portionGuide');
  const sections = groupPortionGuide(entries);

  return (
    <SettingsSection title={t('title')} description={t('description')} icon="guide" flush>
      <TableRoot>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.food')}</TableHead>
              <TableHead>{t('columns.unit')}</TableHead>
              <TableHead>{t('columns.weight')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.length === 0 ? (
              <TableEmpty colSpan={3}>{t('empty')}</TableEmpty>
            ) : (
              sections.flatMap((section) => [
                /*
                  A group heading inside the table rather than a table per group:
                  three columns repeated seven times is seven headers to read,
                  and the columns never change.
                */
                <TableRow key={section.group}>
                  <TableCell
                    colSpan={3}
                    className="bg-muted/40 font-medium text-caption text-muted-foreground"
                  >
                    {t(`groups.${section.group}`)}
                  </TableCell>
                </TableRow>,

                ...section.entries.map((entry) => (
                  <TableRow key={entry.foodId}>
                    <TableCell dir="auto">{localizedName(entry, locale)}</TableCell>

                    <TableCell dir="auto">
                      {localizedName(
                        { nameAr: entry.labelAr, nameEn: entry.labelEn },
                        locale,
                      )}
                    </TableCell>

                    <TableCell numeric className="whitespace-nowrap">
                      <span className="tabular-nums">{t('grams', { value: entry.grams })}</span>

                      {/*
                        The spread, where one was recorded. A heaped spoon is not
                        a precise object, and showing 22-27 beside the 25 is what
                        stops the 25 reading as more certain than it is.
                      */}
                      {entry.rangeGrams ? (
                        <span className="ms-2 text-caption text-muted-foreground tabular-nums">
                          {t('range', {
                            min: entry.rangeGrams[0],
                            max: entry.rangeGrams[1],
                          })}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )),
              ])
            )}
          </TableBody>
        </Table>
      </TableRoot>
    </SettingsSection>
  );
}
