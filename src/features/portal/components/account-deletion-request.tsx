'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  requestAccountDeletionAction,
  withdrawClientRequestAction,
} from '@/features/portal/actions';
import { initialClientRequestState, type ClientRequestSummary } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/format';

/**
 * `طلب حذف الحساب` — asking the clinic to close the account.
 *
 * **Nothing is deleted here, and nothing happens on one tap.** Two reasons, and
 * both are about the client rather than about caution for its own sake. A
 * client's appointments, plans and check-ins are also the clinic's records, and
 * a portal button cannot decide what a practice is obliged to keep. And a
 * mis-tap on the last row of a settings screen must not be able to end
 * someone's care — so this is a request a person receives and answers, and it
 * takes a deliberate second step to file.
 *
 * **The second step is confirmation, not friction.** The first tap opens the
 * explanation of what actually happens; the confirm button beneath it carries a
 * hidden `confirm` field the server insists on. So the check is data the
 * request must contain, not trust that the UI asked — a stray POST files
 * nothing.
 *
 * **Clay, and only here.** It is the system's one true alarm colour and this is
 * the one row on the screen that earns it. Sign-out sits directly above in
 * ordinary ink for exactly that contrast: leaving is an everyday, reversible
 * act, and this is not.
 */
export function AccountDeletionRequest({
  openRequest,
  locale,
}: {
  openRequest: ClientRequestSummary | null;
  locale: Locale;
}) {
  const t = useTranslations('portal.settings.deletion');

  if (openRequest) {
    return (
      <div className="space-y-2 rounded-md rounded-ee-xl bg-card p-3 ring-1 ring-border">
        <p className="text-sm font-medium text-secondary-foreground">{t('pending')}</p>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('pendingSince', {
            date: formatDate(locale, openRequest.createdAt, { dateStyle: 'long' }),
          })}
        </p>

        <form action={withdrawClientRequestAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="kind" value={openRequest.kind} />
          <PendingButton label={t('withdraw')} variant="ghost" />
        </form>
      </div>
    );
  }

  return <DeletionDisclosure locale={locale} />;
}

function DeletionDisclosure({ locale }: { locale: Locale }) {
  const t = useTranslations('portal.settings.deletion');
  const tErrors = useTranslations('portal');

  const [state, formAction] = useActionState(requestAccountDeletionAction, initialClientRequestState);
  const [open, setOpen] = useState(false);

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      {/*
        Step one. It opens an explanation — it does not file anything — so it is
        worded as a request and styled as an ordinary row, not as a red button
        waiting to be hit.
      */}
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-md px-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        {t('action')}
      </summary>

      <form action={formAction} className="space-y-3 px-2 pt-3">
        <input type="hidden" name="locale" value={locale} />
        {/* The second step, carried as data the server refuses to act without. */}
        <input type="hidden" name="confirm" value="confirmed" />

        <p className="text-sm leading-relaxed text-muted-foreground">{t('explanation')}</p>

        <div className="space-y-1.5">
          <Label htmlFor="deletion-reason">{t('reasonLabel')}</Label>
          <Textarea
            id="deletion-reason"
            name="message"
            maxLength={1000}
            rows={2}
            placeholder={t('reasonPlaceholder')}
          />
        </div>

        {state.status === 'error' ? (
          <p role="alert" className="text-sm text-destructive">
            {tErrors(state.messageKey)}
          </p>
        ) : null}

        <PendingButton label={t('confirm')} variant="destructive" />
      </form>
    </details>
  );
}

function PendingButton({
  label,
  variant,
}: {
  label: string;
  variant: 'destructive' | 'ghost';
}) {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} size={variant === 'ghost' ? 'sm' : 'default'} disabled={pending}>
      {pending ? t('loading') : label}
    </Button>
  );
}
