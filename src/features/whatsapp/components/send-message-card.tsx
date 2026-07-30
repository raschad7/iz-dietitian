'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { Textarea } from '@/components/ui/textarea';
import { type Locale } from '@/i18n/routing';

import { sendWhatsappMessageAction } from '../actions';
import { initialSendMessageState } from '../form-state';
import { MAX_BODY_LENGTH } from '../templates';
import { type MessageLogEntry } from '../types';

/**
 * The WhatsApp composer on a client's page, plus their thread.
 *
 * Rendered only when the clinic has WhatsApp connected — an empty box that
 * silently does nothing is worse than no box. The parent page decides that; this
 * component assumes it can send.
 *
 * There is no optimistic append: a message that shows up in the thread before the
 * gateway accepted it would be a claim this app cannot back up. The action
 * revalidates the page instead, so what appears is what was actually recorded.
 */

type SendMessageCardProps = {
  locale: Locale;
  clientId: string;
  /** Oldest first — the order a conversation reads in. */
  thread: readonly MessageLogEntry[];
  /** False when the client has no phone number; the form is then read-only. */
  canSend: boolean;
};

export function SendMessageCard({ locale, clientId, thread, canSend }: SendMessageCardProps) {
  const t = useTranslations('whatsapp');

  const [state, formAction] = useActionState(sendWhatsappMessageAction, initialSendMessageState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('send.title')}</CardTitle>
        {!canSend ? <CardDescription>{t('send.noPhone')}</CardDescription> : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {thread.length > 0 ? (
          <ul className="space-y-2">
            {thread.map((message) => (
              <li
                key={message.id}
                className={
                  message.direction === 'inbound'
                    ? 'rounded-lg bg-muted p-3 text-start text-sm'
                    : 'rounded-lg bg-primary/10 p-3 text-start text-sm'
                }
              >
                <p className="whitespace-pre-line">{message.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(`log.status.${message.status}`)}
                  {message.error ? ` — ${message.error}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientId" value={clientId} />

          <Textarea
            name="body"
            rows={3}
            required
            maxLength={MAX_BODY_LENGTH}
            disabled={!canSend}
            placeholder={t('send.placeholder')}
            aria-label={t('send.title')}
          />

          {state.status !== 'idle' ? (
            <p className={state.status === 'success' ? 'text-sm text-primary' : 'text-sm text-destructive'}>
              {t(state.messageKey)}
            </p>
          ) : null}

          <ConfirmSubmitButton label={t('send.button')} variant="default" />
        </form>
      </CardContent>
    </Card>
  );
}
