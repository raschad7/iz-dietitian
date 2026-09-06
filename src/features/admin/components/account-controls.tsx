'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import type { Locale } from '@/i18n/routing';

import { promoteToAdminAction, setAccountDisabledAction, type AdminActionState } from '../actions';
import { ReasonDialog } from './reason-dialog';

/**
 * The per-row controls on the accounts screen.
 *
 * Both post a state rather than a toggle, and both re-check server-side. A
 * refusal comes back as a message key rather than a thrown error: "this is the
 * last platform admin" is a thing the reader needs to *read*, and an error
 * boundary would replace the whole table with an apology instead.
 *
 * ## Which of them asks for a reason
 *
 * **Disabling and promoting do.** One takes an account away from the person
 * using it; the other hands somebody the keys to every clinic on the deployment.
 * Both are recorded, and neither is something a reviewer should have to
 * reconstruct from a timestamp.
 *
 * **Enabling does not.** Restoring access is the reverse of a decision that was
 * already justified, and putting the same toll on the way back is how a panel
 * ends up with accounts left disabled because nobody had a sentence ready.
 */

const IDLE: AdminActionState = { status: 'idle' };

/** Renders a refusal under the button, in the reader's language. */
function Refusal({ state }: { state: AdminActionState }) {
  const t = useTranslations('admin.accounts.errors');

  if (state.status !== 'error') return null;

  const key = state.message ?? 'invalid';

  return (
    <p role="alert" className="mt-1 text-caption text-status-attention-fg">
      {t.has(key as 'invalid') ? t(key as 'invalid') : t('invalid')}
    </p>
  );
}

export function DisableAccountButton({
  userId,
  name,
  locale,
  disabled,
}: {
  userId: string;
  name: string;
  locale: Locale;
  disabled: boolean;
}) {
  const t = useTranslations('admin.accounts.disable');

  const [state, formAction] = useActionState<AdminActionState, FormData>(
    setAccountDisabledAction.bind(null, !disabled),
    IDLE,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="locale" value={locale} />

      {disabled ? (
        <ConfirmSubmitButton
          size="sm"
          label={t('enable')}
          confirmTitle={t('enableTitle', { name })}
          confirmMessage={t('enableBody')}
          variant="neutral"
        />
      ) : (
        <ReasonDialog
          locale={locale}
          trigger={t('action')}
          title={t('confirmTitle', { name })}
          description={t('confirmBody')}
          confirmLabel={t('action')}
        />
      )}

      <Refusal state={state} />
    </form>
  );
}

export function PromoteAccountButton({
  userId,
  name,
  locale,
}: {
  userId: string;
  name: string;
  locale: Locale;
}) {
  const t = useTranslations('admin.accounts.promote');
  const [state, formAction] = useActionState<AdminActionState, FormData>(promoteToAdminAction, IDLE);

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="locale" value={locale} />

      {/*
        `tone="default"` rather than destructive. Promotion is not destruction —
        it is a grant — and drawing it in the deletion colour beside a disable
        button would make the two read as the same kind of act. It still asks for
        a reason, which is what marks it as consequential.
      */}
      <ReasonDialog
        locale={locale}
        tone="default"
        trigger={t('action')}
        title={t('confirmTitle', { name })}
        description={t('confirmBody')}
        confirmLabel={t('action')}
      />

      <Refusal state={state} />
    </form>
  );
}
