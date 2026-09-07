'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { deleteFreezeAction, freezeSubscriptionAction, resumeFreezeAction } from '@/features/billing/actions';
import { initialBillingFormState, type BillingErrorKey } from '@/features/billing/form-state';
import type { ClientFreeze } from '@/features/billing/queries';
import { activeFreeze } from '@/features/billing/subscription';
import { SettingsEditDialog } from '@/features/settings/components/settings-edit-dialog';
import type { Locale } from '@/i18n/routing';
import type { IsoDate } from '@/lib/iso-date';

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
              <StartsOnField locale={locale} today={today} invalid={invalid} />
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
 * The day the pause starts, on the app's own calendar.
 *
 * It was `<input type="date">`, which is a different control in every browser,
 * navigates by typing into three slots the dietitian cannot see the boundaries
 * of, and opens a grid that looks like nothing else in the product. `DatePicker`
 * is the field the rest of the app uses — the clinic's calendar toolbar, the
 * client card, the bills export — with the same month grid and the same caption
 * ring, so the one date on this dialog is picked the way every other date is.
 *
 * Its own component, and not two lines inside the dialog's render prop, because
 * the picker holds the chosen day in state and `SettingsEditDialog` calls that
 * prop during its own render — a hook there would be a hook inside another
 * component's body. Being a component also means it is remounted by the form's
 * `key={String(open)}`, so a dialog dismissed mid-edit reopens on today rather
 * than on the abandoned day.
 *
 * **No day after today.** Back-dating is the ordinary way this gets entered —
 * writing down on Thursday that somebody stopped on Sunday — but a freeze
 * starting next week would be a record no control on this screen can act on:
 * `activeFreeze` would not find it, so Resume would never appear, and the next
 * freeze recorded over those days would be refused as an overlap with a row
 * nobody can see.
 */
function StartsOnField({
  locale,
  today,
  invalid,
}: {
  locale: Locale;
  today: string;
  invalid: boolean;
}) {
  const [startsOn, setStartsOn] = useState(today);

  return (
    <DatePicker
      id="freeze-starts-on"
      name="startsOn"
      locale={locale}
      value={startsOn}
      onChange={setStartsOn}
      max={today as IsoDate}
      aria-invalid={invalid}
      className="w-56"
    />
  );
}

/**
 * The two ways a running freeze ends.
 *
 * **Resume** closes it because the subscriber is back: the days it covered are
 * the days that did not count, and the term end settles there. It ends the
 * freeze *yesterday* rather than today — see `resumeFreeze`, which explains why
 * a freeze closed today would leave the record still reading frozen.
 *
 * **Remove** deletes the row, for a freeze recorded by mistake — and it gives
 * the days back, which is why it says so rather than sitting beside Resume as
 * an equal. They are not two ways of doing the same thing.
 *
 * ## A failure is said out loud
 *
 * Both writes report whether they found the freeze, and a press that changed
 * nothing renders the reason. The screen behind these buttons is server
 * rendered and both actions revalidate it, so a success needs nothing here: the
 * row redraws with Freeze in place of this pair, which is the whole
 * confirmation.
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
  const [failed, setFailed] = useState<BillingErrorKey | null>(null);

  /*
    One runner for both buttons. Each clears the previous failure before it
    tries, so a Remove that works does not sit under the message Resume left
    behind — a stale error beside a control that has since succeeded is read as
    the current state of the record.
  */
  const run = (write: () => Promise<{ status: string; messageKey?: BillingErrorKey }>) => {
    setFailed(null);
    start(async () => {
      const result = await write();
      setFailed(result.status === 'error' ? (result.messageKey ?? 'genericError') : null);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="neutral"
          size="sm"
          disabled={pending}
          onClick={() => run(() => resumeFreezeAction(locale, clientId, freeze.id, today))}
        >
          {t('freeze.resume')}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={pending}
          onClick={() => run(() => deleteFreezeAction(locale, clientId, freeze.id))}
        >
          {t('freeze.remove')}
        </Button>
      </div>

      {failed ? <FieldError>{t(`errors.${failed}`)}</FieldError> : null}
    </div>
  );
}
