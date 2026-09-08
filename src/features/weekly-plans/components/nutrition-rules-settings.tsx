'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/number-field';
import { SelectField } from '@/components/ui/select-field';
import { initialFieldEditState } from '@/features/clinic-profile/form-state';
import { SettingsEditDialog } from '@/features/settings/components/settings-edit-dialog';
import {
  SettingsRow,
  SettingsSection,
} from '@/features/settings/components/settings-section';
import type { Locale } from '@/i18n/routing';

import { saveNutritionRulesAction } from '../actions';
import {
  BMR_SOURCES,
  PROTEIN_BASES,
  PROTEIN_PER_KG_MAX,
  PROTEIN_PER_KG_MIN,
  PROTEIN_PER_KG_STEP,
  type NutritionRules,
} from '../nutrition-rules';

/**
 * The two rules the clinic sets, and the app used to hard-code.
 *
 * ## Why these are on a settings page at all
 *
 * Both were constants, and both were wrong for the practice using them. The
 * protein rate sat at 1.6 g/kg — an upper-band figure out of sports practice —
 * against a dietitian who doses at roughly 1 g/kg, so every suggestion the app
 * made was high enough that she overrode it by hand. A number a practitioner
 * corrects on every record is not a default; it is a setting nobody has written
 * yet. The reasoning for each is on `clinic_nutrition_rules`.
 *
 * ## Two rows and two dialogs, but one action
 *
 * `saveNutritionRulesAction` always writes all three columns, because the row is
 * upserted whole. Each dialog therefore carries the values it is *not* editing
 * as `hiddenFields`. That is what the prop is for, and it is why neither dialog
 * can save a half-row: a clinic that edits the rate does not silently reset its
 * BMR choice to the default.
 *
 * ## The rate and the basis are one dialog, deliberately
 *
 * ⚠ **A gram-per-kilo rate is meaningless without saying which kilos.** For a
 * 78 kg client at 30% body fat the same "1 g per kg" is 78 g, 59 g or 55 g —
 * a 40% spread on the one figure a whole week is judged against. Splitting them
 * into two rows would let a clinic change the rate on Monday and discover on
 * Friday that it had been reading against a different weight all along. They
 * are shown as one sentence and edited as one form.
 */
export function NutritionRulesSettings({
  locale,
  rules,
}: {
  locale: Locale;
  rules: NutritionRules;
}) {
  const t = useTranslations('nutritionRules');
  const format = useFormatter();

  const rate = format.number(rules.proteinPerKg, { maximumFractionDigits: 1 });

  return (
    <SettingsSection title={t('title')} description={t('description')} icon="leaf">
      {/*
        ⚠ **No `description` on this row, and that is a layout constraint as
        much as an editorial one.** `SettingsRow` is `flex-wrap`, so its action
        is placed against the content column's *max-content* width before any
        shrinking happens — a two-line description therefore pushes the Change
        button onto a line of its own, and this row would be the only one on the
        settings page that did it.

        Nothing is lost. The value states the whole rule in one sentence, which
        is what a row is for; the paragraph explaining what an adjusted weight
        *is* is guidance for choosing between the three, and it lives in the
        dialog where the choosing happens — updating live as the select moves,
        which is more than it could do sitting here.
      */}
      <SettingsRow
        label={t('protein.label')}
        value={t('protein.value', { perKg: rate, basis: t(`basis.${rules.proteinBasis}.name`) })}
        action={
          <SettingsEditDialog
            locale={locale}
            title={t('protein.dialogTitle')}
            triggerLabel={t('change')}
            triggerAriaLabel={t('protein.changeLabel')}
            /* The value this dialog does not edit, so the upsert writes a whole
               row rather than resetting the BMR choice to its default. */
            hiddenFields={{ bmrSource: rules.bmrSource }}
            action={saveNutritionRulesAction}
            initialState={initialFieldEditState}
          >
            {() => <ProteinFields rules={rules} />}
          </SettingsEditDialog>
        }
      />

      <SettingsRow
        label={t('bmr.label')}
        value={t(`bmr.${rules.bmrSource}.name`)}
        description={t(`bmr.${rules.bmrSource}.hint`)}
        action={
          <SettingsEditDialog
            locale={locale}
            title={t('bmr.dialogTitle')}
            triggerLabel={t('change')}
            triggerAriaLabel={t('bmr.changeLabel')}
            hiddenFields={{
              proteinPerKg: String(rules.proteinPerKg),
              proteinBasis: rules.proteinBasis,
            }}
            action={saveNutritionRulesAction}
            initialState={initialFieldEditState}
          >
            {() => (
              <Field>
                <Label htmlFor="bmrSource">{t('bmr.label')}</Label>
                <SelectField
                  id="bmrSource"
                  name="bmrSource"
                  defaultValue={rules.bmrSource}
                  options={BMR_SOURCES.map((source) => ({
                    value: source,
                    label: t(`bmr.${source}.name`),
                  }))}
                />
                <p className="text-caption text-muted-foreground">{t('bmr.dialogHint')}</p>
              </Field>
            )}
          </SettingsEditDialog>
        }
      />
    </SettingsSection>
  );
}

/**
 * The rate and the weight it multiplies, with the chosen basis explained under
 * the pair.
 *
 * The hint is live rather than static because it is the whole point of the
 * control: the three bases are not three labels but three different weights,
 * and a reader picking between them needs to know which body the number lands
 * on before they save, not after. `useState` here rather than a controlled form
 * — the select posts itself; this only decides which sentence is printed.
 */
function ProteinFields({ rules }: { rules: NutritionRules }) {
  const t = useTranslations('nutritionRules');
  const [basis, setBasis] = useState(rules.proteinBasis);

  return (
    <>
      <NumberField
        name="proteinPerKg"
        label={t('protein.rateLabel')}
        unit={t('protein.rateUnit')}
        min={PROTEIN_PER_KG_MIN}
        max={PROTEIN_PER_KG_MAX}
        step={PROTEIN_PER_KG_STEP}
        defaultValue={String(rules.proteinPerKg)}
        hint={t('protein.rateHint', { min: PROTEIN_PER_KG_MIN, max: PROTEIN_PER_KG_MAX })}
      />

      <Field>
        <Label htmlFor="proteinBasis">{t('protein.basisLabel')}</Label>
        <SelectField
          id="proteinBasis"
          name="proteinBasis"
          value={basis}
          onValueChange={setBasis}
          options={PROTEIN_BASES.map((option) => ({
            value: option,
            label: t(`basis.${option}.name`),
          }))}
        />
        <p className="text-caption text-muted-foreground">{t(`basis.${basis}.hint`)}</p>
      </Field>
    </>
  );
}
