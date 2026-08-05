'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { type Locale } from '@/i18n/routing';

import { answerClientRequestAction } from '../actions';
import { type StaffClientRequest } from '../types';

/**
 * Closing a request about the client's own record.
 *
 * Two buttons and no dialog, because there is nothing to fill in: resolving
 * means a person at the clinic has already made the correction on the client's
 * record, and this is them saying so. Nothing about that record is written from
 * here — see the header of `src/db/schema/client-requests.ts` for why asking is
 * the whole mechanism.
 *
 * An `account_deletion` is closed the same way and deletes nothing. Ending
 * someone's care is a deliberate act taken from their own record, where the
 * archive and delete controls already live.
 */

export type ClientRequestActionsProps = {
  request: StaffClientRequest;
  locale: Locale;
  size?: 'default' | 'sm';
};

export function ClientRequestActions({ request, locale, size = 'default' }: ClientRequestActionsProps) {
  const t = useTranslations('requests');
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function answer(status: 'resolved' | 'declined'): void {
    setError(null);

    startTransition(async () => {
      const result = await answerClientRequestAction(locale, {
        requestId: request.id,
        status,
        kind: request.kind,
      });

      if (!result.ok) {
        // Only this feature's own keys can arrive here — answering a client
        // request never touches the calendar, so there is no booking namespace
        // to fall back to.
        setError(result.namespace === 'booking' ? t('errors.unexpected') : t(result.error));
        return;
      }

      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size={size} onClick={() => answer('resolved')} disabled={pending}>
          <Icon name="check" />
          {t('actions.markDone')}
        </Button>

        <Button type="button" variant="ghost" size={size} onClick={() => answer('declined')} disabled={pending}>
          <Icon name="close" />
          {t('actions.decline')}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-caption text-status-medical-fg">
          {error}
        </p>
      ) : null}
    </>
  );
}
