'use client';

import { Info, PencilLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requestDataUpdateAction, withdrawClientRequestAction } from '@/features/portal/actions';
import {
  initialClientRequestState,
  type ClientRequestSummary,
  type ClientRequestTopic,
} from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/format';

/**
 * The screen's closing note: this is your dietitian's record, and here is what
 * to do if something in it is wrong.
 *
 * **Why this exists instead of edit icons.** Every field above is a clinical
 * fact somebody recorded and builds a plan against. Thirty pencils would offer
 * thirty edits the client cannot make; one sentence and one request explains the
 * situation honestly and gives them a real way through it. The correction is a
 * message to a person, and a person answers it.
 *
 * **Quiet, not alarming.** It is an ordinary card in the sunken muted tone, not
 * a warning banner — nothing has gone wrong, and a client whose record is
 * perfectly correct should be able to read past it without a jolt.
 *
 * **A request already waiting replaces the form.** The database allows one open
 * correction per client, so offering a second one would be offering a button
 * that is refused. Instead the block shows what was asked and when, and the way
 * to take it back.
 *
 * A client component for the disclosure and the form's error, both of which are
 * browser state. `<details>` rather than a `useState` panel: it opens with
 * JavaScript off, and the form inside it posts to a server action that works the
 * same way.
 */
export function DataUpdateRequest({
  topic,
  openRequest,
  locale,
}: {
  /** Which part of the record this block sits under; sent with the request so staff can route it. */
  topic: ClientRequestTopic;
  openRequest: ClientRequestSummary | null;
  locale: Locale;
}) {
  const t = useTranslations('portal.profile.update');

  /*
    `contact` sits under the account settings and is about the two identifiers
    on that screen; every other topic is the profile's record-wide notice. The
    form underneath is identical — only the sentence introducing it differs,
    because the two screens are asking about different things.
  */
  const noticeKey = topic === 'contact' ? 'contactNotice' : 'notice';

  return (
    <Card className="border-transparent bg-muted shadow-none">
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-muted-foreground"
          >
            <Info className="size-4.5" strokeWidth={1.8} />
          </span>

          <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
            {t(noticeKey)}
          </p>
        </div>

        {openRequest ? (
          <PendingRequest request={openRequest} locale={locale} />
        ) : (
          <RequestDisclosure topic={topic} locale={locale} />
        )}
      </CardContent>
    </Card>
  );
}

function RequestDisclosure({ topic, locale }: { topic: ClientRequestTopic; locale: Locale }) {
  const t = useTranslations('portal.profile.update');
  const tErrors = useTranslations('portal');

  const actionKey = topic === 'contact' ? 'contactAction' : 'action';

  const [state, formAction] = useActionState(requestDataUpdateAction, initialClientRequestState);

  // Mirrored from the `<details>` element's own event rather than replacing it,
  // so the panel still opens when this component has not hydrated yet.
  const [open, setOpen] = useState(false);

  return (
    <details
      className="group/disclosure"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      {/*
        `list-none` hides the triangle in Chrome and Firefox; Safari needs the
        `::-webkit-details-marker` pseudo-element as well, and without it the
        button renders with a stray disclosure arrow inside it.
      */}
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] rounded-ee-xl bg-card px-3.5 text-sm font-medium text-secondary-foreground ring-1 ring-border transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] hover:rounded-ee-[30px] hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <PencilLine className="size-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
        {t(actionKey)}
      </summary>

      <form action={formAction} className="space-y-3 pt-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="topic" value={topic} />

        <div className="space-y-1.5">
          <Label htmlFor="update-message">{t('messageLabel')}</Label>

          <Textarea
            id="update-message"
            name="message"
            required
            maxLength={1000}
            rows={3}
            placeholder={t('messagePlaceholder')}
            aria-invalid={state.status === 'error' || undefined}
            aria-describedby={state.status === 'error' ? 'update-error' : undefined}
            className="bg-card"
          />

          <p className="text-xs leading-relaxed text-muted-foreground">{t('messageHelp')}</p>
        </div>

        {state.status === 'error' ? (
          <p id="update-error" role="alert" className="text-sm text-destructive">
            {tErrors(state.messageKey)}
          </p>
        ) : null}

        <SubmitButton label={t('submit')} />
      </form>
    </details>
  );
}

function PendingRequest({ request, locale }: { request: ClientRequestSummary; locale: Locale }) {
  const t = useTranslations('portal.profile.update');

  return (
    <div className="space-y-2 rounded-md rounded-ee-xl bg-card p-3 ring-1 ring-border">
      <p className="text-sm font-medium text-secondary-foreground">{t('pending')}</p>

      <p className="text-xs text-muted-foreground">
        {t('pendingSince', { date: formatDate(locale, request.createdAt, { dateStyle: 'long' }) })}
      </p>

      <form action={withdrawClientRequestAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="kind" value={request.kind} />

        <WithdrawButton label={t('withdraw')} />
      </form>
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="default" disabled={pending}>
      {pending ? t('loading') : label}
    </Button>
  );
}

function WithdrawButton({ label }: { label: string }) {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? t('loading') : label}
    </Button>
  );
}
