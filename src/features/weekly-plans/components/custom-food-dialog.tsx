'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field, FieldError, FieldHint } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getLocaleDirection } from '@/i18n/routing';

import { createCustomFoodAction } from '../catalog-actions';
import type { FoodSearchResult } from '../queries';

type FieldName = 'description' | 'nameAr' | 'kcal' | 'protein' | 'carbs' | 'fat';
type FieldErrors = Partial<Record<FieldName, string>>;

/**
 * Adds a food to the clinic's own library when the search in `FoodPicker`
 * comes up short.
 *
 * The dietitian enters the nutrition per 100g directly — no AI estimate here,
 * that is a later increment. Numbers are kept as controlled strings so an
 * empty field can be told apart from a typed zero while validating.
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
  const activeLocale = useLocale();
  const [pending, startTransition] = useTransition();

  const [description, setDescription] = useState('');
  const [nameAr, setNameAr] = useState(initialNameAr ?? '');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState(false);

  // Resets the form to a clean slate each time the dialog opens, rather than
  // carrying over a previous attempt's values into an unrelated food. Derived
  // during render — the documented pattern for mirroring a prop into state —
  // so no stale value ever paints for a frame first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDescription('');
      setNameAr(initialNameAr ?? '');
      setKcal('');
      setProtein('');
      setCarbs('');
      setFat('');
      setErrors({});
      setSubmitError(false);
    }
  }

  function close() {
    if (pending) return;
    onOpenChange(false);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};

    if (!description.trim()) next.description = t('customFoodDialog.errors.required');
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

    return next;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitError(false);
    startTransition(async () => {
      const result = await createCustomFoodAction(locale, {
        description: description.trim(),
        nameAr: nameAr.trim(),
        kcal: Number(kcal),
        protein: Number(protein),
        carbs: Number(carbs),
        fat: Number(fat),
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
        description={t('customFoodDialog.description')}
        onClose={close}
        closeLabel={t('customFoodDialog.close')}
      />

      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Field>
            <Label htmlFor="custom-food-description">{t('customFoodDialog.descriptionLabel')}</Label>
            <Input
              id="custom-food-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('customFoodDialog.descriptionPlaceholder')}
              aria-invalid={Boolean(errors.description) || undefined}
              disabled={pending}
            />
            <FieldError>{errors.description}</FieldError>
          </Field>

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

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label htmlFor="custom-food-kcal">{t('customFoodDialog.kcalLabel')}</Label>
              <Input
                id="custom-food-kcal"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={kcal}
                onChange={(event) => setKcal(event.target.value)}
                aria-invalid={Boolean(errors.kcal) || undefined}
                disabled={pending}
              />
              <FieldError>{errors.kcal}</FieldError>
            </Field>

            <Field>
              <Label htmlFor="custom-food-protein">{t('customFoodDialog.proteinLabel')}</Label>
              <Input
                id="custom-food-protein"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={protein}
                onChange={(event) => setProtein(event.target.value)}
                aria-invalid={Boolean(errors.protein) || undefined}
                disabled={pending}
              />
              <FieldError>{errors.protein}</FieldError>
            </Field>

            <Field>
              <Label htmlFor="custom-food-carbs">{t('customFoodDialog.carbsLabel')}</Label>
              <Input
                id="custom-food-carbs"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={carbs}
                onChange={(event) => setCarbs(event.target.value)}
                aria-invalid={Boolean(errors.carbs) || undefined}
                disabled={pending}
              />
              <FieldError>{errors.carbs}</FieldError>
            </Field>

            <Field>
              <Label htmlFor="custom-food-fat">{t('customFoodDialog.fatLabel')}</Label>
              <Input
                id="custom-food-fat"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={fat}
                onChange={(event) => setFat(event.target.value)}
                aria-invalid={Boolean(errors.fat) || undefined}
                disabled={pending}
              />
              <FieldError>{errors.fat}</FieldError>
            </Field>
          </div>

          <FieldHint>{t('customFoodDialog.macrosHint')}</FieldHint>

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
          <Button type="submit" disabled={pending}>
            {pending ? t('customFoodDialog.submitting') : t('customFoodDialog.submit')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
