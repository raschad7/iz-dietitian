'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

import { saveProfileAction } from '../actions';
import { initialProfileFormState } from '../form-state';
import type { ClientContext } from '../queries';
import { ALLERGENS, DEFAULT_MEAL_SCHEDULE, type MealScheduleInput } from '../schema';
import { suggestProteinGrams } from '../targets';

/**
 * Base UI inputs keep their own state when used with `defaultValue` and warn if
 * that default changes after mounting. A changed key remounts only the affected
 * input when a saved profile comes back from the server.
 */
export function profileInputKey(value: number | null | undefined): string {
  return value == null ? 'empty' : `value:${value}`;
}

/**
 * The nutrition profile: the six things `clients` does not hold, plus the schedule.
 *
 * The schedule is editable rows rather than a fixed five, because a client eating
 * three times a day is ordinary and a plan generated against five slots they do not
 * use is worthless. Rows are submitted as parallel arrays — which is what an HTML
 * form can express — and zipped back together in the action.
 *
 * Shares are entered as whole percentages and divided by 100 in the action. Asking a
 * dietitian to type 0.35 would be asking them to think in the storage format.
 */
export function NutritionProfileForm({
  context,
  locale,
}: {
  context: ClientContext;
  locale: Locale;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(saveProfileAction, initialProfileFormState);

  const [slots, setSlots] = useState<MealScheduleInput>(
    context.profile?.mealSchedule ?? DEFAULT_MEAL_SCHEDULE,
  );

  const errorFor = (field: string) =>
    state.status === 'error' ? state.fieldErrors?.[field]?.[0] : undefined;

  const shareTotal = slots.reduce((sum, slot) => sum + slot.kcalShare, 0);

  return (
    <form action={formAction} className="max-w-3xl space-y-6 text-start">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={context.clientId} />

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t('sections.targets')}</legend>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="weightKg" label={t('fields.weightKg')} error={errorFor('weightKg')}>
            <Input
              key={profileInputKey(context.profile?.weightKg)}
              id="weightKg"
              name="weightKg"
              type="number"
              step="0.1"
              min="20"
              max="400"
              dir="ltr"
              defaultValue={context.profile?.weightKg ?? ''}
            />
          </Field>

          <Field
            id="dailyKcalTarget"
            label={t('fields.dailyKcalTarget')}
            error={errorFor('dailyKcalTarget')}
            // The computed suggestion is shown as help text, not prefilled: an empty
            // field means "keep using the formula", and prefilling it would silently
            // freeze today's number as a permanent override.
            hint={
              context.targets.suggestedKcal !== null
                ? t('suggested', { value: context.targets.suggestedKcal })
                : t('notComputable')
            }
          >
            <Input
              key={profileInputKey(context.profile?.dailyKcalTarget)}
              id="dailyKcalTarget"
              name="dailyKcalTarget"
              type="number"
              min="800"
              max="6000"
              dir="ltr"
              placeholder={context.targets.suggestedKcal?.toString() ?? ''}
              defaultValue={context.profile?.dailyKcalTarget ?? ''}
            />
          </Field>

          <Field
            id="proteinTargetGrams"
            label={t('fields.proteinTargetGrams')}
            error={errorFor('proteinTargetGrams')}
            hint={
              context.profile?.weightKg
                ? t('suggested', { value: suggestProteinGrams(context.profile.weightKg) ?? 0 })
                : undefined
            }
          >
            <Input
              key={profileInputKey(context.profile?.proteinTargetGrams)}
              id="proteinTargetGrams"
              name="proteinTargetGrams"
              type="number"
              min="20"
              max="400"
              dir="ltr"
              defaultValue={context.profile?.proteinTargetGrams ?? ''}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t('fields.allergenTags')}</legend>
        <p className="text-caption text-muted-foreground">{t('allergenHint')}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {ALLERGENS.map((allergen) => (
            <label key={allergen} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="allergenTags"
                value={allergen}
                defaultChecked={context.profile?.allergenTags.includes(allergen)}
                className="size-4 rounded border-border"
              />
              {t(`allergens.${allergen}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t('sections.preferences')}</legend>

        <Field id="preferences" label={t('fields.preferences')} error={errorFor('preferences')}>
          <Textarea
            id="preferences"
            name="preferences"
            rows={2}
            maxLength={1000}
            defaultValue={context.profile?.preferences ?? ''}
          />
        </Field>

        <Field id="dislikes" label={t('fields.dislikes')} error={errorFor('dislikes')}>
          <Textarea
            id="dislikes"
            name="dislikes"
            rows={2}
            maxLength={1000}
            defaultValue={context.profile?.dislikes ?? ''}
          />
        </Field>

        <Field
          id="permanentInstructions"
          label={t('fields.permanentInstructions')}
          error={errorFor('permanentInstructions')}
          hint={t('permanentInstructionsHint')}
        >
          <Textarea
            id="permanentInstructions"
            name="permanentInstructions"
            rows={3}
            maxLength={2000}
            defaultValue={context.profile?.permanentInstructions ?? ''}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t('sections.schedule')}</legend>
        <p className="text-caption text-muted-foreground">{t('scheduleHint')}</p>

        <div className="space-y-2">
          {slots.map((slot, index) => (
            <div key={slot.slotKey} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="slotKey" value={slot.slotKey} />

              <div className="min-w-32 flex-1">
                <Label htmlFor={`slotLabel-${index}`}>
                  {t('fields.slotLabel')}
                </Label>
                <Input
                  id={`slotLabel-${index}`}
                  name="slotLabel"
                  required
                  maxLength={60}
                  defaultValue={slot.label}
                />
              </div>

              <div>
                <Label htmlFor={`slotTime-${index}`}>
                  {t('fields.slotTime')}
                </Label>
                <Input
                  id={`slotTime-${index}`}
                  name="slotTime"
                  type="time"
                  required
                  dir="ltr"
                  defaultValue={slot.timeOfDay}
                />
              </div>

              <div className="w-24">
                <Label htmlFor={`slotShare-${index}`}>
                  {t('fields.slotShare')}
                </Label>
                <Input
                  id={`slotShare-${index}`}
                  name="slotShare"
                  type="number"
                  min="0"
                  max="100"
                  dir="ltr"
                  defaultValue={Math.round(slot.kcalShare * 100)}
                />
              </div>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                // One slot is the minimum: a schedule of none cannot be planned
                // against, and the schema would reject it anyway.
                disabled={slots.length <= 1}
                onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}
              >
                {t('removeSlot')}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={slots.length >= 8}
            onClick={() =>
              setSlots((current) => [
                ...current,
                {
                  // Suffixed by position so the key is unique and stable; the schema
                  // rejects duplicates, and a collision would silently drop a slot.
                  slotKey: `snack_${current.length + 1}`,
                  label: '',
                  timeOfDay: '16:00',
                  kcalShare: 0.1,
                },
              ])
            }
          >
            {t('addSlot')}
          </Button>

          <span className="text-caption text-muted-foreground">
            {/* Shares are normalised on the server, so this is information rather
                than a validation error — but a dietitian aiming at 100 wants to know
                where they are. */}
            {t('shareTotal', { value: Math.round(shareTotal * 100) })}
          </span>
        </div>

        {errorFor('mealSchedule') && (
          <p className="text-caption text-destructive">{errorFor('mealSchedule')}</p>
        )}
      </fieldset>

      <div className="flex items-center gap-3">
        <SaveButton />

        <Link
          href={`/app/weekly-plans/${context.clientId}`}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          {t('backToBoard')}
        </Link>

        {state.status === 'saved' && <span className="text-sm text-primary">{t('saved')}</span>}
        {state.status === 'error' && (
          <span className="text-sm text-destructive">{t(state.messageKey)}</span>
        )}
      </div>
    </form>
  );
}

function SaveButton() {
  const t = useTranslations('weeklyPlans');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? t('saving') : t('save')}
    </Button>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-caption text-muted-foreground">{hint}</p>}
      {error && <p className="text-caption text-destructive">{error}</p>}
    </div>
  );
}
