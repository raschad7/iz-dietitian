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
  PROTEIN_RATE_CASES,
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

  /*
    How many kinds of client are dosed differently from the ordinary one — the
    athlete row, the two renal rows, whichever of them this clinic has filled
    in. Named as a count rather than listed: the row states the rule everybody
    is on, and four rates spelled out in one sentence is a paragraph.
  */
  const caseCount = PROTEIN_RATE_CASES.filter(
    (key) => rules.proteinRates[key] !== undefined,
  ).length;

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
        value={
          caseCount === 0
            ? t('protein.value', { perKg: rate, basis: t(`basis.${rules.proteinBasis}.name`) })
            : t('protein.valueWithCases', {
                perKg: rate,
                basis: t(`basis.${rules.proteinBasis}.name`),
                count: caseCount,
              })
        }
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
            /*
              Every value this dialog does not edit, the per-case rates
              included. The row is upserted whole, so a rate left out here is a
              rate cleared by somebody changing the BMR source.
            */
            hiddenFields={{
              proteinPerKg: String(rules.proteinPerKg),
              proteinBasis: rules.proteinBasis,
              ...caseHiddenFields(rules),
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

      {/*
        The kinds of client dosed differently from the ordinary one.

        In the same dialog as the rate above and not a row of their own, for the
        reason the rate and the basis share one: these are four readings of the
        same rule, and a clinic that changed the athlete rate on one screen
        without seeing the ordinary one beside it would have no idea whether it
        had just raised or lowered anything.

        Every box may be left empty, and empty is a real answer — this clinic
        does not treat that kind of client differently and the ordinary rate
        applies. It is also the only way to *remove* a case, which is why the
        fields are not `required`.
      */}
      <fieldset className="space-y-2">
        <legend className="text-label font-semibold text-muted-foreground">
          {t('protein.casesLabel')}
        </legend>
        <p className="text-caption text-muted-foreground">{t('protein.casesHint')}</p>

        {/* Stacked, not three across. The labels name a condition rather than a
            figure — "كلى — بدون غسيل" — and at a third of a dialog they wrapped
            onto two lines while "رياضي" stayed on one, so the three boxes sat at
            different heights. A column gives each label the width it needs. */}
        <div className="grid gap-3 pt-1">
          {PROTEIN_RATE_CASES.map((key) => (
            <NumberField
              key={key}
              name={`rate.${key}`}
              label={t(`cases.${key}`)}
              unit={t('protein.rateUnit')}
              min={PROTEIN_PER_KG_MIN}
              max={PROTEIN_PER_KG_MAX}
              step={PROTEIN_PER_KG_STEP}
              defaultValue={rateValue(rules, key)}
              placeholder={String(rules.proteinPerKg)}
            />
          ))}
        </div>
      </fieldset>
    </>
  );
}

/** One case's rate as the input wants it — `''` for a case with no rate. */
function rateValue(rules: NutritionRules, key: (typeof PROTEIN_RATE_CASES)[number]): string {
  const rate = rules.proteinRates[key];
  return rate === undefined ? '' : String(rate);
}

/**
 * The per-case rates as hidden inputs, for the dialog that does not edit them.
 *
 * A cleared case is simply absent — the same shape the action reads, where a
 * missing or blank field means "no special rate" rather than zero.
 */
function caseHiddenFields(rules: NutritionRules): Record<string, string> {
  return Object.fromEntries(
    PROTEIN_RATE_CASES.filter((key) => rules.proteinRates[key] !== undefined).map((key) => [
      `rate.${key}`,
      String(rules.proteinRates[key]),
    ]),
  );
}
