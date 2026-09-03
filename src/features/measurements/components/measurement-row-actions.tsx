'use client';

import { useTranslations } from 'next-intl';

import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { type Locale } from '@/i18n/routing';
import { type IsoDate } from '@/lib/iso-date';

import { deleteMeasurementAction } from '../actions';

import { MeasurementFormTrigger } from './measurement-form-trigger';
import { type MeasurementFormValues } from './measurement-form';

/**
 * Correct or remove one reading, from its own row in the history.
 *
 * Both are reachable from the table rather than from a detail page, because a
 * dietitian who spots a wrong figure is looking at the row it is wrong in. The
 * edit opens the same card the reading was entered on — `MeasurementFormTrigger`
 * with a `measurement`, so there is one form for recording and correcting and
 * the two cannot drift.
 *
 * Deleting always confirms and names the date, so a mis-click on a table of
 * near-identical rows is caught before it happens — the same rule
 * `DeleteClientButton` applies, and it matters more here because the rows really
 * are near-identical.
 */
export function MeasurementRowActions({
  clientId,
  locale,
  today,
  currentWeightKg,
  measurement,
  /** Already formatted, so the confirmation names the row a reader can see. */
  dateLabel,
}: {
  clientId: string;
  locale: Locale;
  today: IsoDate;
  currentWeightKg: number | null;
  measurement: MeasurementFormValues;
  dateLabel: string;
}) {
  const t = useTranslations('measurements');

  return (
    <div className="flex items-center justify-end gap-1">
      <MeasurementFormTrigger
        clientId={clientId}
        locale={locale}
        today={today}
        currentWeightKg={currentWeightKg}
        measurement={measurement}
        label={t('edit')}
        variant="ghost"
        icon="edit"
      />

      <form action={deleteMeasurementAction} className="flex">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="measurementId" value={measurement.id} />
        <ConfirmSubmitButton
          label={t('delete')}
          confirmTitle={t('delete')}
          confirmMessage={`${dateLabel} — ${t('deleteConfirm')}`}
          variant="destructiveGhost"
          size="icon-sm"
          icon="trash"
        />
      </form>
    </div>
  );
}
