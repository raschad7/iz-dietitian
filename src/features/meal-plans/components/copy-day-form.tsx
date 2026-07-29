'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { Select } from '@/components/ui/select';
import { clearDayAction, copyDayAction } from '@/features/meal-plans/actions';
import { DAYS_OF_WEEK, dayKey } from '@/features/meal-plans/schema';
import { type Locale } from '@/i18n/routing';

/**
 * Copies the open day over another one, or empties it.
 *
 * Both are destructive to a day that may hold real work, so both confirm first,
 * and the copy names its target in the prompt — "copy Sunday to Monday" is only
 * safe to click if you can see which day is about to be overwritten.
 */
export function CopyDayForm({
  locale,
  planId,
  fromDay,
  filledDays,
}: {
  locale: Locale;
  planId: string;
  fromDay: number;
  /** Days that currently hold at least one item, to warn before overwriting one. */
  filledDays: readonly number[];
}) {
  const t = useTranslations('mealPlans');

  const targetId = useId();
  const otherDays = DAYS_OF_WEEK.filter((day) => day !== fromDay);

  const [toDay, setToDay] = useState(String(otherDays[0] ?? 0));

  const fromLabel = t(`days.${dayKey(fromDay)}`);
  const toLabel = t(`days.${dayKey(Number(toDay))}`);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
      <form action={copyDayAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="fromDay" value={fromDay} />

        <div className="space-y-1">
          <label htmlFor={targetId} className="block text-xs text-muted-foreground">
            {t('actions.copyDayTo', { day: fromLabel })}
          </label>
          <Select
            id={targetId}
            name="toDay"
            value={toDay}
            onChange={(event) => setToDay(event.target.value)}
            className="w-44"
          >
            {otherDays.map((day) => (
              <option key={day} value={day}>
                {t(`days.${dayKey(day)}`)}
              </option>
            ))}
          </Select>
        </div>

        {/*
         * Only warns when the target actually has something to lose. A prompt on
         * every copy would train the dietitian to dismiss it unread.
         */}
        <ConfirmSubmitButton
          label={t('actions.copy')}
          confirmMessage={
            filledDays.includes(Number(toDay))
              ? t('actions.confirmCopyDay', { from: fromLabel, to: toLabel })
              : undefined
          }
          size="sm"
        />
      </form>

      <form action={clearDayAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="dayOfWeek" value={fromDay} />
        <ConfirmSubmitButton
          label={t('actions.clearDay')}
          confirmMessage={t('actions.confirmClearDay', { day: fromLabel })}
          variant="ghost"
          size="sm"
        />
      </form>
    </div>
  );
}
