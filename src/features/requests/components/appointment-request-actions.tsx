'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { type ClinicHours } from '@/features/booking/validation';
import { type Locale } from '@/i18n/routing';

import { approveAppointmentRequestAction, declineAppointmentRequestAction } from '../actions';
import { type RequestsResult, type StaffAppointmentRequest } from '../types';

import { ApproveDialog } from './approve-dialog';

/**
 * Accept and decline, for one request.
 *
 * The only client component in the inbox. Everything around it — the cards, the
 * dates, the message catalogue — stays on the server; this owns the dialog's
 * open state and the pending flag while an action is in flight, which is all
 * that genuinely needs the browser.
 *
 * **Accept opens the dialog rather than booking immediately.** The dietitian has
 * to be able to say "yes, but at 10:30", and a one-tap accept would make the
 * common case unreachable. Decline is one tap, because there is nothing to
 * decide about it.
 */

export type AppointmentRequestActionsProps = {
  request: StaffAppointmentRequest;
  locale: Locale;
  hours: ClinicHours | null;
  today: string;
  /** Compact layout for the dashboard panel, where the card is narrower. */
  size?: 'default' | 'sm';
};

export function AppointmentRequestActions({
  request,
  locale,
  hours,
  today,
  size = 'default',
}: AppointmentRequestActionsProps) {
  const t = useTranslations('requests');
  const tBooking = useTranslations('booking');
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Renders whichever namespace the failure came from.
   *
   * A booking rejection arrives under `booking` because it *is* one — "that slot
   * is taken" is the calendar's own sentence, already written in both languages.
   * Restating it under `requests` would be a second copy free to drift.
   */
  function messageFor(result: Extract<RequestsResult, { ok: false }>): string {
    return result.namespace === 'booking' ? tBooking(result.error) : t(result.error);
  }

  function run(action: () => Promise<RequestsResult>, onSuccess: () => void): void {
    setError(null);

    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        setError(messageFor(result));
        return;
      }

      onSuccess();
      // The action revalidates on the server; this is what makes the current
      // page actually re-render with the item gone.
      router.refresh();
    });
  }

  function approve(input: {
    date: string;
    startMinute: number;
    durationMinutes: number;
    reason?: string;
  }): void {
    run(
      () =>
        approveAppointmentRequestAction(locale, {
          requestId: request.id,
          // A cancellation proposes no time, and the server ignores these for
          // that kind — but sending them anyway would be a payload claiming
          // something the request does not say.
          ...(request.kind === 'cancel' ? {} : input),
        }),
      () => setOpen(false),
    );
  }

  function decline(): void {
    run(() => declineAppointmentRequestAction(locale, { requestId: request.id }), () => undefined);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size={size} onClick={() => setOpen(true)} disabled={pending}>
          <Icon name="check" />
          {t('actions.accept')}
        </Button>

        <Button type="button" variant="ghost" size={size} onClick={decline} disabled={pending}>
          <Icon name="close" />
          {t('actions.decline')}
        </Button>
      </div>

      {/* A failure from the one-tap decline has no dialog to appear in. */}
      {error && !open ? (
        <p role="alert" className="text-caption text-status-medical-fg">
          {error}
        </p>
      ) : null}

      {open ? (
        <ApproveDialog
          request={request}
          locale={locale}
          hours={hours}
          today={today}
          pending={pending}
          error={error}
          onConfirm={approve}
          onClose={() => {
            setOpen(false);
            setError(null);
          }}
        />
      ) : null}
    </>
  );
}
