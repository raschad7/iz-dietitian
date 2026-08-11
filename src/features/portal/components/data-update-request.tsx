'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
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
  showNotice = true,
  openRequest,
  locale,
}: {
  /** Which part of the record this block sits under; sent with the request so staff can route it. */
  topic: ClientRequestTopic;
  /**
   * Whether the introducing paragraph is drawn.
   *
   * The health record turns it off: that screen's own module note already
   * establishes that nothing on it is the client's to edit, and by the time
   * someone is looking for this control they have found something wrong — the
   * sentence was explaining a situation they had already worked out. The
   * contact screen keeps it, because `contactNotice` says something its button
   * does not: that a phone number and an email have to be *verified*, so the
   * clinic will call back rather than simply changing them.
   *
   * The request itself is unaffected either way; this hides one paragraph, not
   * the way to correct a record.
   */
  showNotice?: boolean;
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

  const request = openRequest ? (
    <PendingRequest request={openRequest} locale={locale} />
  ) : (
    <RequestDisclosure topic={topic} locale={locale} />
  );

  /*
    **The sunken card is the notice's, not the control's.** Its whole job was to
    mark that paragraph as an aside — something explaining the screen rather
    than part of it. With no paragraph to hold, it was a grey panel wrapped
    around a single button, which reads as a section the button belongs to and
    makes the one control on it look like a disabled surface.

    So a caller that turns the notice off gets the control bare. The glyph goes
    the same way, for the same reason: it marks a sentence as a note, and a lone
    icon over a button is decoration. Nothing about the request itself changes —
    the disclosure, the form and the pending state are the same in both shapes.
  */
  if (!showNotice) return request;

  return (
    <Card className="border-transparent bg-muted shadow-none">
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-muted-foreground"
          >
            <Icon name="info" className="size-4.5" />
          </span>

          <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
            {t(noticeKey)}
          </p>
        </div>

        {request}
      </CardContent>
    </Card>
  );
}

function RequestDisclosure({ topic, locale }: { topic: ClientRequestTopic; locale: Locale }) {
  const t = useTranslations('portal.profile.update');
  const tErrors = useTranslations('portal');
  const tCommon = useTranslations('common');

  const actionKey = topic === 'contact' ? 'contactAction' : 'action';

  const [state, formAction] = useActionState(requestDataUpdateAction, initialClientRequestState);

  // Mirrored from the `<details>` element's own event rather than replacing it,
  // so the panel still opens when this component has not hydrated yet.
  const [open, setOpen] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  /*
    Closing without sending.

    Opening this panel is one tap and reading it is the moment someone realises
    they have nothing to report — so there has to be a way out that is not
    "find the summary again and tap it a second time". It **resets the form**
    as well as closing it: `<details>` only hides its content, so a draft left
    in the textarea would still be sitting there on the next visit under a
    control the client had explicitly cancelled.
  */
  function cancel() {
    formRef.current?.reset();
    setOpen(false);
  }

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
        <Icon name="edit" className="size-4 shrink-0" />
        {t(actionKey)}
      </summary>

      <form ref={formRef} action={formAction} className="space-y-3 pt-3">
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

        {/*
          §Buttons: siblings sit 12px apart, and the primary takes the
          inline-start of the group in both locales — source order plus `flex`,
          so Arabic mirrors it without a `flex-row-reverse`. Send is the
          decision here and wears the brand colour; cancelling is merely
          available, so it is the boxless `ghost` rather than a second outlined
          control competing with it.

          ⚠ Cancel needs JavaScript, where the rest of this panel does not —
          `<details>` opens on its own and the form posts to a server action
          either way. Unhydrated, the summary is still the way to close it,
          which is exactly the behaviour that existed before this button did.
        */}
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label={t('submit')} />

          <Button type="button" variant="ghost" size="default" onClick={cancel}>
            {tCommon('cancel')}
          </Button>
        </div>
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
