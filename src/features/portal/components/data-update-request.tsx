'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requestDataUpdateAction, withdrawClientRequestAction } from '@/features/portal/actions';
import {
  initialClientRequestState,
  type ClientRequestSummary,
  type ClientRequestTopic,
} from '@/features/portal/types';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
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
    <RequestDialogTrigger
      topic={topic}
      locale={locale}
      noticeKey={noticeKey}
      /*
        The two shapes want two buttons. Inside the notice card the control is
        the last thing in a paragraph's block, so it starts where the paragraph
        does and takes an edge to separate itself from the grey it sits on. Bare
        at the foot of the health record it has neither a paragraph to align to
        nor a fill to stand out from — see the trigger for what it becomes.
      */
      standalone={!showNotice}
    />
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

/**
 * The correction request, asked for in a modal rather than in place.
 *
 * **Why a dialog and not the disclosure this replaces.** The control used to be
 * a `<summary>` that unfolded a textarea and two buttons directly into the
 * card. On the health record that pushed the rest of the screen down at the
 * moment the client started typing, and on the contact screen it grew a form
 * inside a settings list — a row that turns into a form reads as the list
 * having broken rather than as a task having started. A modal is the shape the
 * app already gives "write something and send it": the client record's own two
 * forms are dialogs for the same reason, and the reason given there applies
 * here too — losing your place is not a reasonable price for filing a note.
 *
 * **What it costs, stated honestly.** The disclosure worked with JavaScript
 * off: `<details>` opens on its own and the form posted to a server action
 * either way. A dialog does not — `showModal()` is script. Everything else on
 * these two screens is still readable and the client can still reach the
 * clinic by phone from Settings, so this trades a path almost nobody takes for
 * a form that does not move the page underneath it.
 *
 * **Mounted, not conditionally rendered**, which is what lets it animate
 * *out*. `Dialog` drives the exit through `data-closing` and only calls
 * `close()` when the animation has run; unmounting on close — the pattern
 * `client-form-trigger.tsx` uses, because it has data to load first — skips
 * that entirely. Keeping it mounted also means `<dialog>`'s own `close()`
 * restores focus to the trigger natively, so none of the manual focus
 * bookkeeping that file needs is required here.
 *
 * **No portal, unlike that file.** These screens render inside
 * `.q-route-stage`, whose route-enter animation puts a `transform` and a
 * `clip-path` on an ancestor — the two things that would normally trap a
 * `fixed` child, and the reason `HomeGlow` had to be hoisted out of the page.
 * A dialog opened with `showModal()` is promoted to the **top layer**, which is
 * painted outside the ancestor chain entirely, so neither reaches it. Skipping
 * the portal keeps this server-renderable: a closed `<dialog>` is `display:
 * none` under the UA stylesheet, so it costs a node and needs no
 * "have we hydrated yet" flag to avoid touching `document` during SSR.
 */
function RequestDialogTrigger({
  topic,
  locale,
  noticeKey,
  standalone = false,
}: {
  topic: ClientRequestTopic;
  locale: Locale;
  /** The same sentence the card shows, repeated inside — see below. */
  noticeKey: 'notice' | 'contactNotice';
  /**
   * Whether the trigger stands on its own rather than closing a notice card.
   *
   * Only the button's drawing changes; the dialog it opens is identical. See
   * the button itself for why the bare shape gives up its border.
   */
  standalone?: boolean;
}) {
  const t = useTranslations('portal.profile.update');
  const tErrors = useTranslations('portal');
  const tCommon = useTranslations('common');

  const actionKey = topic === 'contact' ? 'contactAction' : 'action';

  const [state, formAction] = useActionState(requestDataUpdateAction, initialClientRequestState);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  /*
    Closing without sending **resets the form**. Opening this is one tap and
    reading it is the moment someone realises they have nothing to report; a
    draft left in the textarea would otherwise still be there the next time the
    dialog opened, under a control the client had explicitly cancelled.

    A success needs no handler: the action revalidates, `openRequest` comes back
    set, and `DataUpdateRequest` swaps this whole component for
    `PendingRequest`. That is the confirmation this flow is built around — see
    `ClientRequestFormState`, which deliberately has no success member — and it
    takes the dialog with it.
  */
  function close() {
    formRef.current?.reset();
    setOpen(false);
  }

  const trigger = (
    <Button
      type="button"
      /*
        `ghost` when it stands alone — no border, no box until you touch it,
        the olive label and glyph left to carry it.

        `outline`'s edge is what tells a control apart from the surface behind
        it, and at the foot of the health record there is nothing to be told
        apart from: the button is the last thing on the page, on the page's own
        background, with white cards above it. The box read as an empty field
        rather than as a control, and it was the one outlined object on a screen
        of borderless cards. Inside the notice card the edge still earns its
        keep — there it sits on a grey fill with a paragraph above it.

        Still `Button` and still 48px tall, so nothing is given up but the line.
      */
      variant={standalone ? 'ghost' : 'outline'}
      onClick={() => setOpen(true)}
    >
      <Icon name="edit" />
      {t(actionKey)}
    </Button>
  );

  return (
    <>
      {/*
        Centred when standalone, and centred by a wrapper rather than by
        `mx-auto` on the button: `buttonVariants` caps its width at 320px but
        does not set one, so the control is only as wide as its label — a margin
        can centre that, but a flex row is what says the *row* is centred, which
        is what a closing action at the foot of a page wants. In the notice card
        it is returned bare and keeps its inline-start alignment under the
        paragraph.
      */}
      {standalone ? <div className="flex justify-center">{trigger}</div> : trigger}

      <Dialog
        open={open}
        onClose={close}
        label={t(actionKey)}
        dir={getLocaleDirection(locale)}
        flat
        /*
          Centred on a phone, not risen from the bottom edge.

          This is the app's shortest modal — a sentence, one textarea and two
          buttons — and as a bottom sheet it was a strip along the block-end
          edge under two-thirds of a blurred page, which reads as a surface that
          stopped halfway open rather than as a small one. The sheet shape earns
          its keep where the content wants the screen's full height; here there
          is nothing to fill it with, and stretching the form to justify the
          shape would be inventing work for the client.

          Both screens that open this get it: the health record's
          "طلب تحديث البيانات" and the contact settings' request to change a
          phone or an email are the same component, so this is one decision, not
          two that have to be kept in step.
        */
        placement="center"
        // No responsive class of its own: the ceiling, the flex column and the
        // scrolling body come from the responsive dialog frame in `globals.css`.
      >
        {/*
          No close button in the corner: the footer ends in Cancel, and Escape
          and a backdrop click both close it. §Fields — "a third exit only
          crowds the corner the title starts from".
        */}
        <DialogHeader title={t(actionKey)} />

        {/*
          The frame in `globals.css` gives this wrapper its flex column and its
          `min-block-size: 0` — it matches the `:has()` rule there — so the body
          is what scrolls on a short phone in landscape rather than the dialog
          growing past its ceiling and taking its own footer off screen. Left
          stated here as well because it costs nothing and reads as intent.
        */}
        <form ref={formRef} action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="topic" value={topic} />

          <DialogBody className="min-h-0 flex-1 overflow-y-auto">
            {/*
              The notice is repeated here, and that is not duplication: the
              scrim blurs the card it also sits on, so while this is open it is
              the only readable copy. It matters most on the contact screen,
              where it is the sentence explaining that a phone number and an
              email have to be verified — which is exactly what the client is
              about to ask for.
            */}
            <p className="text-sm leading-relaxed text-muted-foreground">{t(noticeKey)}</p>

            <Field>
              <Label htmlFor="update-message">{t('messageLabel')}</Label>

              <Textarea
                id="update-message"
                name="message"
                required
                maxLength={1000}
                rows={4}
                placeholder={t('messagePlaceholder')}
                aria-invalid={state.status === 'error' || undefined}
                aria-describedby={state.status === 'error' ? 'update-error' : undefined}
              />
            </Field>

            {state.status === 'error' ? (
              <p id="update-error" role="alert" className="text-sm text-destructive">
                {tErrors(state.messageKey)}
              </p>
            ) : null}
          </DialogBody>

          {/*
            `DialogFooter` justifies to the inline-end and takes the primary
            last in DOM order — cancel first, so a stray Enter cannot be the
            thing that files the request.
          */}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {tCommon('cancel')}
            </Button>

            <SubmitButton label={t('submit')} />
          </DialogFooter>
        </form>
      </Dialog>
    </>
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
