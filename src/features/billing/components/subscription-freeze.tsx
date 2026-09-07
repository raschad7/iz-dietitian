'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { deleteFreezeAction, freezeSubscriptionAction, resumeFreezeAction } from '@/features/billing/actions';
import { initialBillingFormState } from '@/features/billing/form-state';
import type { ClientFreeze } from '@/features/billing/queries';
import { activeFreeze } from '@/features/billing/subscription';
import { SettingsEditDialog } from '@/features/settings/components/settings-edit-dialog';
import type { Locale } from '@/i18n/routing';

/**
 * Pausing a subscriber's subscription, and letting it run again.
 *
 * The clinic already did this — a subscriber travels for nine days, or is ill,
 * and those days are not counted against the term they paid for. It was being
 * done on paper, which meant the register was quietly wrong for the whole of
 * every freeze and a renewal date had to be worked out by hand.
 *
 * ## Two controls, and which one is showing is the whole state
 *
 * A subscriber who is running has **Freeze**; one who is paused has **Resume**
 * and nothing else. There is no third state and no switch: a switch would let
 * somebody set "frozen" without saying from when, and the day it started is the
 * only thing the arithmetic actually needs.
 *
 * ## The length is optional, and that is the common case
 *
 * "تجميد ٩ أيام" is what a clinic agrees with a subscriber, so the field takes
 * days and the end date is arithmetic on it — done in `freezeSubscriptionSchema`
 * rather than by a dietitian counting on a calendar. Leaving it empty leaves the
 * freeze **open**, which is the honest answer when nobody yet knows how long
 * somebody will be away: the term end moves out a day at a time until Resume
 * closes it.
 */
export function SubscriptionFreezeControls({
  locale,
  clientId,
  today,
  freezes,
}: {
  locale: Locale;
  clientId: string;
  /** The clinic's own today — what a freeze starts on, and what Resume ends it on. */
  today: string;
  freezes: readonly ClientFreeze[];
}) {
  const running = activeFreeze(freezes, today);

  return running ? (
    <ResumeFreeze locale={locale} clientId={clientId} today={today} freeze={running} />
  ) : (
    <FreezeDialog locale={locale} clientId={clientId} today={today} />
  );
}

/** The editor: when the pause starts, how long it runs, and why. */
function FreezeDialog({
  locale,
  clientId,
  today,
}: {
  locale: Locale;
  clientId: string;
  today: string;
}) {
  const t = useTranslations('billing');

  return (
    <SettingsEditDialog
      locale={locale}
      title={t('freeze.title')}
      triggerLabel={t('freeze.open')}
      hiddenFields={{ clientId }}
      action={freezeSubscriptionAction}
      initialState={initialBillingFormState}
    >
      {(state) => {
        const invalid = state.status === 'error';

        return (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="freeze-starts-on">{t('freeze.startsOn')}</Label>
              {/*
                A plain date box defaulting to today, which is what a freeze
                being recorded now is. Back-dating is deliberately allowed: a
                dietitian writing down on Thursday that somebody stopped on
                Sunday is the ordinary way this gets entered.
              */}
              <Input
                id="freeze-starts-on"
                name="startsOn"
                type="date"
                dir="ltr"
                defaultValue={today}
                aria-invalid={invalid}
                className="w-44"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="freeze-days">{t('freeze.days')}</Label>
              <Input
                id="freeze-days"
                name="days"
                inputMode="numeric"
                autoComplete="off"
                dir="ltr"
                placeholder="9"
                aria-invalid={invalid}
                className="w-24 text-end tabular-nums"
              />
              {/* Empty is a real answer — see the note at the top of this file. */}
              <p className="text-caption text-muted-foreground">{t('freeze.daysHint')}</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="freeze-reason">{t('freeze.reason')}</Label>
              <Textarea id="freeze-reason" name="reason" rows={2} aria-invalid={invalid} />
            </div>

            {state.status === 'error' ? (
              <FieldError>{t(`errors.${state.messageKey}`)}</FieldError>
            ) : null}
          </>
        );
      }}
    </SettingsEditDialog>
  );
}

/**
 * The two ways a running freeze ends.
 *
 * **Resume** closes it today, which is what happens when the subscriber comes
 * back: the days between the start and today are the days that did not count,
 * and the term end settles there.
 *
 * **Remove** deletes the row, for a freeze recorded by mistake — and it gives
 * the days back, which is why it says so rather than sitting beside Resume as
 * an equal. They are not two ways of doing the same thing.
 */
function ResumeFreeze({
  locale,
  clientId,
  today,
  freeze,
}: {
  locale: Locale;
  clientId: string;
  today: string;
  freeze: ClientFreeze;
}) {
  const t = useTranslations('billing');
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="neutral"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await resumeFreezeAction(locale, clientId, freeze.id, today);
            setFailed(result.status === 'error');
          })
        }
      >
        {t('freeze.resume')}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await deleteFreezeAction(locale, clientId, freeze.id);
            setFailed(result.status === 'error');
          })
        }
      >
        {t('freeze.remove')}
      </Button>

      {failed ? <FieldError>{t('errors.genericError')}</FieldError> : null}
    </div>
  );
}
