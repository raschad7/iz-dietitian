'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field, FieldError, FieldHint } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { getLocaleDirection } from '@/i18n/routing';

import { createCustomFoodAction } from '../catalog-actions';
import { CUSTOM_FOOD_UNITS } from '../catalog-schema';
import { suggestUnitKey } from '../portion-derivation';
import type { FoodSearchResult } from '../queries';

type FieldName = 'nameAr' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'unitGrams';
type FieldErrors = Partial<Record<FieldName, string>>;

/**
 * Adds a food to the clinic's own library when the search comes up short — kept
 * deliberately focused (spec §24).
 *
 * The Arabic name, the four macros per 100 g, and a natural serving unit are all
 * that is asked for. The unit (spec §10) lets the dietitian add the food by the
 * loaf / cup / piece later, not only by grams — it is persisted on the food's
 * `portionLabel`/`portionGrams`, and its default is guessed from the name (خبز →
 * رغيف). The English name is optional and sits last. Nothing about sources,
 * aliases, or which database this lands in appears.
 */
export function CustomFoodDialog({
  locale,
  open,
  onOpenChange,
  initialNameAr,
  onCreated,
}: {
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialNameAr?: string;
  onCreated: (food: FoodSearchResult) => void;
}) {
  const t = useTranslations('dishEditor');
  const tUnits = useTranslations('dishEditor.editor.units');
  const activeLocale = useLocale();
  const [pending, startTransition] = useTransition();

  const [nameAr, setNameAr] = useState(initialNameAr ?? '');
  const [description, setDescription] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [unit, setUnit] = useState<string>(() => suggestUnitKey(initialNameAr ?? ''));
  const [unitGrams, setUnitGrams] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState(false);

  // Reset to a clean slate each time the dialog opens. Derived during render — the
  // documented pattern for mirroring a prop into state — so no stale value paints.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const seedName = initialNameAr ?? '';
      setNameAr(seedName);
      setDescription('');
      setKcal('');
      setProtein('');
      setCarbs('');
      setFat('');
      setUnit(suggestUnitKey(seedName));
      setUnitGrams('');
      setErrors({});
      setSubmitError(false);
    }
  }

  const usesHouseholdUnit = unit !== 'g';

  function close() {
    if (pending) return;
    onOpenChange(false);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};

    // English name is optional; only the Arabic name and the macros are required.
    if (!nameAr.trim()) next.nameAr = t('customFoodDialog.errors.required');

    for (const [key, value] of [
      ['kcal', kcal],
      ['protein', protein],
      ['carbs', carbs],
      ['fat', fat],
    ] as const) {
      const parsed = Number(value);
      if (value.trim() === '' || Number.isNaN(parsed) || parsed < 0) {
        next[key] = t('customFoodDialog.errors.nonNegativeNumber');
      }
    }

    // A household unit must carry a positive grams-per-unit; grams-only needs none.
    if (usesHouseholdUnit) {
      const grams = Number(unitGrams);
      if (unitGrams.trim() === '' || Number.isNaN(grams) || grams <= 0) {
        next.unitGrams = t('customFoodDialog.errors.unitGramsRequired');
      }
    }

    return next;
  }

  function submit() {
    if (pending) return;

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitError(false);
    startTransition(async () => {
      const result = await createCustomFoodAction(locale, {
        nameAr: nameAr.trim(),
        description: description.trim(),
        kcal: Number(kcal),
        protein: Number(protein),
        carbs: Number(carbs),
        fat: Number(fat),
        unit,
        unitGrams: usesHouseholdUnit ? Number(unitGrams) : undefined,
      });

      if (result.ok) {
        onOpenChange(false);
        onCreated(result.food);
      } else {
        setSubmitError(true);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      label={t('customFoodDialog.title')}
      dir={getLocaleDirection(activeLocale)}
      dismissible={!pending}
    >
      <DialogHeader
        title={t('customFoodDialog.title')}
        onClose={close}
        closeLabel={t('customFoodDialog.close')}
      />

      {/*
        A plain container, NOT a <form>: this dialog's native <dialog> renders
        inline inside the dish editor's own <form> (the editor uses a server
        action), and a nested <form> is invalid HTML that breaks hydration. The
        submit is imperative anyway; Enter on a field still triggers it.
      */}
      <div
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      >
        <DialogBody className="gap-5">
          <Field>
            <Label htmlFor="custom-food-name-ar">{t('customFoodDialog.nameArLabel')}</Label>
            <Input
              id="custom-food-name-ar"
              dir="rtl"
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              placeholder={t('customFoodDialog.nameArPlaceholder')}
              aria-invalid={Boolean(errors.nameAr) || undefined}
              disabled={pending}
            />
            <FieldError>{errors.nameAr}</FieldError>
          </Field>

          <div>
            <p className="pb-2 text-label font-semibold">{t('customFoodDialog.macrosHeading')}</p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['kcal', kcal, setKcal],
                  ['protein', protein, setProtein],
                  ['carbs', carbs, setCarbs],
                  ['fat', fat, setFat],
                ] as const
              ).map(([key, value, setValue]) => (
                <Field key={key}>
                  <Label htmlFor={`custom-food-${key}`}>{t(`customFoodDialog.${key}Label`)}</Label>
                  <Input
                    id={`custom-food-${key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    aria-invalid={Boolean(errors[key]) || undefined}
                    disabled={pending}
                  />
                  <FieldError>{errors[key]}</FieldError>
                </Field>
              ))}
            </div>
            <FieldHint className="mt-2">{t('customFoodDialog.macrosHint')}</FieldHint>
          </div>

          {/* Natural serving unit (spec §10) — persisted on the food itself. */}
          <div>
            <p className="pb-2 text-label font-semibold">{t('customFoodDialog.unitHeading')}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label htmlFor="custom-food-unit">{t('customFoodDialog.unitLabel')}</Label>
                <SelectField
                  id="custom-food-unit"
                  value={unit}
                  onValueChange={setUnit}
                  disabled={pending}
                  options={CUSTOM_FOOD_UNITS.map((value) => ({
                    value,
                    label: value === 'g' ? t('customFoodDialog.unitGrams') : tUnits(value),
                  }))}
                />
              </Field>

              {usesHouseholdUnit && (
                <Field>
                  <Label htmlFor="custom-food-unit-grams">{t('customFoodDialog.unitGramsLabel')}</Label>
                  <Input
                    id="custom-food-unit-grams"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={unitGrams}
                    onChange={(event) => setUnitGrams(event.target.value)}
                    aria-invalid={Boolean(errors.unitGrams) || undefined}
                    disabled={pending}
                  />
                  <FieldError>{errors.unitGrams}</FieldError>
                </Field>
              )}
            </div>
            <FieldHint className="mt-2">{t('customFoodDialog.unitHint')}</FieldHint>
          </div>

          {/* English name — optional and last, the same as a dish's. */}
          <Field>
            <Label htmlFor="custom-food-description">{t('customFoodDialog.descriptionLabel')}</Label>
            <Input
              id="custom-food-description"
              dir="ltr"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('customFoodDialog.descriptionPlaceholder')}
              disabled={pending}
            />
          </Field>

          {submitError && (
            <p role="alert" className="flex items-center gap-1.5 text-body-sm text-destructive">
              <Icon name="attention" className="size-4 shrink-0" />
              {t('customFoodDialog.errors.createFailed')}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close} disabled={pending}>
            {t('customFoodDialog.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? t('customFoodDialog.submitting') : t('customFoodDialog.submit')}
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
