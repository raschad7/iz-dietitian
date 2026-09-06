'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import type { Locale } from '@/i18n/routing';

import { setClinicSuspensionAction, type AdminActionState } from '../actions';
import { ReasonDialog } from './reason-dialog';

/**
 * The control that turns a practice off, and the one that turns it back on.
 *
 * ## The two directions are deliberately not symmetrical
 *
 * **Suspending goes through `ReasonDialog`** and will not submit without a
 * sentence. It signs every dietitian at the practice out mid-session and the
 * clinic cannot see who did it or why; months later this box is the only record.
 *
 * **Reactivating goes through the ordinary confirmation.** Making it as costly
 * to give access back as to take it away is how a panel ends up with clinics
 * left suspended because nobody had a sentence ready. It still asks first,
 * because it is not the clean reversal it looks like — the revoked sessions are
 * gone either way, so both directions cost somebody a sign-in.
 *
 * A client component for `useActionState` and the dialog's own state. The action
 * re-checks `requireAdminSession` and re-validates the reason server-side; this
 * file decides nothing about who may press the button, it only draws it.
 */
export function SuspendClinicForm({
  clinicId,
  clinicName,
  locale,
  suspended,
}: {
  clinicId: string;
  clinicName: string;
  locale: Locale;
  suspended: boolean;
}) {
  const t = useTranslations('admin.clinics.suspend');

  /*
    `suspended` is captured into the bound action, so the button always posts
    the state it is asking for rather than a toggle the server has to work out.
    Two requests racing then converge on the same answer instead of flipping
    each other.
  */
  const [state, formAction] = useActionState<AdminActionState, FormData>(
    setClinicSuspensionAction.bind(null, !suspended),
    { status: 'idle' },
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="clinicId" value={clinicId} />
      <input type="hidden" name="locale" value={locale} />

      {suspended ? (
        <ConfirmSubmitButton
          label={t('reactivate')}
          confirmTitle={t('reactivateTitle', { name: clinicName })}
          confirmMessage={t('reactivateBody')}
          variant="neutral"
        />
      ) : (
        <ReasonDialog
          locale={locale}
          trigger={t('action')}
          title={t('confirmTitle', { name: clinicName })}
          description={t('confirmBody')}
          confirmLabel={t('action')}
        />
      )}

      {state.status === 'error' ? (
        <p role="alert" className="text-body-sm text-status-attention-fg">
          {state.message === 'reasonRequired' ? t('reasonRequired') : t('failed')}
        </p>
      ) : null}
    </form>
  );
}
