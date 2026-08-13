'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
import { type PortalRequest, type RequestStatus } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * What the client asked for, and where each ask got to.
 *
 * Shown alongside the appointments themselves rather than on a page of its own:
 * a request is only ever read in the context of "so what is happening with my
 * appointments?", and a separate screen would make the client hunt for it.
 *
 * **Read-only.** A request is a record of an ask and its answer, not something
 * to edit: the client files it from the request form and the dietitian answers
 * it from their inbox. There is no withdraw button here — `withdrawRequest`
 * exists in the mutations and nothing in this redesign exposes it.
 *
 * A pending row shows the day asked for and no time, because the client named
 * none. The section renders only when there is something in it, so it
 * disappears on its own once everything has been answered.
 *
 * ## One card that opens, not a stack of cards
 *
 * Every request used to be its own `Card`: a white box with a shadow, a status
 * rule down its inline-start edge and a tinted disc holding a glyph. Four asks
 * therefore drew four boxes, four shadows, four rules and four discs down a
 * phone — and a client who has written four notes has said four *sentences*,
 * which is not four screens' worth of furniture. Worse, the section grew without
 * limit: the most recent ask, the one this section exists to show, was pushed
 * further off screen with every one filed before it.
 *
 * It is now one card. The newest request is its face; the rest live behind a
 * chevron at the card's inline-end and slide open under it. That inverts the
 * problem — the list can grow to any length without costing the page a pixel
 * beyond the first row, and "what did I last ask for?" is answered without
 * opening anything.
 *
 * **What went with the stack.** The per-row disc and the status rule are gone.
 * Both existed to tell one card from the next in a column of identical white
 * boxes; inside a single card the hairline between rows does that work, and a
 * glyph repeated down every row of a list of four is decoration rather than
 * information. The chip stays, because it is the one mark on a row whose *words*
 * change — it is what a client opens this section to read.
 *
 * ## Opening it
 *
 * The height animates through `grid-template-rows: 0fr → 1fr` rather than
 * `max-height`. A `max-height` transition has to guess a ceiling: too low clips
 * the last row, too high spends most of the duration animating empty space, so
 * the panel appears to stall and then snap. `0fr → 1fr` animates to the
 * content's real height whatever it is, which is what makes four rows and forty
 * open at the same speed and with the same easing.
 *
 * ⚠ The inner `overflow-hidden` wrapper is not optional — a grid track of `0fr`
 * clamps the *track*, not the box in it, so without it the rows stay fully drawn
 * on top of the card underneath.
 *
 * The whole face row is the button, not the chevron. That is why `RequestRow`
 * below must stay free of anything interactive: a link or a second button inside
 * it would be a control nested in a control, which is invalid HTML and behaves
 * differently in every browser that tries to make sense of it. If a row ever
 * needs its own action, the disclosure has to move back onto the chevron.
 */

/**
 * Status is not a traffic light (design-system.md §06). `attention` is amber
 * because a pending request is genuinely waiting on someone; `incomplete` is
 * neutral grey rather than red because a declined request is information, not a
 * failure — the dietitian answered, and the answer was no.
 */
type RequestTone = 'attention' | 'onTrack' | 'incomplete' | 'muted';

const STATUS_TONES = {
  pending: 'attention',
  approved: 'onTrack',
  declined: 'incomplete',
  withdrawn: 'muted',
} as const satisfies Record<RequestStatus, RequestTone>;

/**
 * A `new` request that names no time is a note, not an ask awaiting a verdict.
 *
 * The dietitian reads it and books — or does not — from their own screen;
 * nothing ever moves it out of `pending`. So it must not wear the amber
 * "waiting for your dietitian" chip, which promises an answer that is not
 * coming. It says nothing at all, and that is the honest end of it.
 *
 * Rows filed before the portal stopped asking for a day still carry one, and
 * are still genuinely pending — they keep the amber chip.
 */
function isNote(request: PortalRequest): boolean {
  return request.kind === 'new' && request.preferredDate === null;
}

export function RequestList({ requests }: { requests: readonly PortalRequest[] }) {
  const t = useTranslations('portal');
  const [open, setOpen] = useState(false);
  const panelId = useId();

  /*
    Read by index rather than destructured, so `noUncheckedIndexedAccess` gets a
    real narrowing out of the guard: `const [lead] = requests` stays
    `PortalRequest | undefined` however the length is tested above it.

    The section's caller already renders nothing for an empty list; this is the
    component holding its own end of that contract rather than trusting it.
  */
  const lead = requests[0];
  if (lead === undefined) return null;

  const rest = requests.slice(1);

  return (
    /*
      `gap-0 py-0`: `Card` is a flex column with its own vertical padding and a
      gap between children, both of which are wrong for a container whose
      children are ruled rows. The rows carry their own inset, and the hairline
      between them has to meet the card's edges rather than float in a gutter.

      The default variant is already `overflow-hidden`, which is what clips the
      first and last rows to the card's 16px radius without either of them
      needing a corner of its own.
    */
    <Card size="sm" className="gap-0 py-0">
      {/*
        The newest ask is the card's face — `splitAppointments` hands this list
        over already sorted, so index 0 is the one a client came here to check.

        **The whole row is the control, not the chevron.** A 40px disc at the far
        edge of a phone-width card is a target you have to aim at, and it is the
        only part of a row that plainly *is* a row — so the obvious place to
        press was the one place that did nothing. The chevron stays exactly where
        it was and still says which way this opens; it is now a mark on the
        button rather than the button.

        Rendered as a plain `div` when there is nothing behind it. A single
        request has nothing to disclose, and a control that does nothing when
        pressed is worse than no control.
      */}
      {rest.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          /*
            No `aria-label`. The button's accessible name is its own content —
            the request a client is looking at — and a label would *replace*
            that with a generic phrase, so a screen reader would announce a
            control with no idea which ask it sits on. `aria-expanded` states
            the disclosure, and the `sr-only` line below adds what the chevron
            says visually.

            `inset-ring` for focus rather than `ring` + `ring-offset`: this row
            runs edge to edge inside a card that is `overflow-hidden`, so an
            offset ring would be drawn outside the card and clipped away.
          */
          className="group/toggle flex w-full items-start gap-2 px-(--card-spacing) py-3 text-start transition-colors outline-none hover:bg-accent/60 focus-visible:inset-ring-2 focus-visible:inset-ring-ring active:bg-accent"
        >
          <RequestRow request={lead} />

          <span className="sr-only">
            {open ? t('request.showLess') : t('request.showMore', { count: rest.length })}
          </span>

          {/*
            The chevron sits at the card's inline-end — the left in Arabic, the
            right in English — because `ms-auto` pushes to the *logical* end and
            a disclosure belongs at the edge a reader's eye leaves the row by.

            `chevronDown` and a rotation, not a swap to `chevronUp`. The glyph
            turning through 180° *is* the statement that the panel underneath is
            moving, and it is the one part of the gesture visible before the rows
            have started to appear. Two different glyphs would cut between two
            stills.

            It is deliberately not in `icon.tsx`'s DIRECTIONAL set: down is down
            in both scripts, and a mirrored chevron would rotate the wrong way in
            Arabic.

            `aria-hidden` on the whole disc — it is a picture of the state
            `aria-expanded` already reports, and announcing both says it twice.
          */}
          <span
            aria-hidden
            className="-me-1.5 ms-auto grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors group-hover/toggle:text-foreground"
          >
            <Icon
              name="chevronDown"
              className={cn(
                'size-4.5 transition-transform duration-300 ease-(--ease-sweep) motion-reduce:transition-none',
                open && 'rotate-180',
              )}
            />
          </span>
        </button>
      ) : (
        <div className="flex px-(--card-spacing) py-3">
          <RequestRow request={lead} />
        </div>
      )}

      {rest.length > 0 ? (
        <div
          id={panelId}
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-(--ease-sweep) motion-reduce:transition-none',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          {/*
            ⚠ The `overflow-hidden` is what the collapse actually is. A `0fr`
            track sizes the *track*; the row inside it keeps its own height and
            paints straight over the card below unless it is clipped here.

            `inert` while closed, because clipped is not hidden: without it the
            rows stay in the tab order and in the accessibility tree, so a
            keyboard lands on links inside a panel nobody can see and a screen
            reader announces four requests the screen is showing one of. React 19
            takes it as a boolean prop.
          */}
          <ul className="overflow-hidden" inert={!open}>
            {rest.map((request) => (
              <li
                key={request.id}
                // The rule separates two rows of one card, so it goes *above*
                // each following row rather than below every row — a trailing
                // border on the last one would draw a line along the card's own
                // inside edge.
                className="flex border-t border-border px-(--card-spacing) py-3"
              >
                <RequestRow request={request} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/** One ask: what it was, how it went, when for, and what the client wrote. */
function RequestRow({ request }: { request: PortalRequest }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal');

  const note = isNote(request) && request.status === 'pending';
  const tone: RequestTone = note ? 'muted' : STATUS_TONES[request.status];
  const hasWhen = request.appointment !== null || request.preferredDate !== null;

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-heading text-body-md leading-snug font-semibold">
          {note ? t('request.kind.note') : t(`request.kind.${request.kind}`)}
        </span>

        {/*
          A note carries no chip.

          It had one reading "sent", and it failed the badge test in §Colour: a
          pill marks a state, and a state has to vary. Nothing ever moves a note
          out of `pending`, so that chip said the same word on every note row a
          client had ever written — three identical pills down a list of three.
          The row's own title already says it is a message.

          A real ask still gets one, because there the word does change: it is
          what the client opens this section to read, and now that the status
          rule down each card's edge is gone it is the only channel left saying
          how the ask went. That is a deliberate narrowing to one channel on a
          row whose *words* carry the same fact, not colour used alone.
        */}
        {note ? null : <Badge variant={tone}>{t(`request.status.${request.status}`)}</Badge>}
      </div>

      {/*
        Icon-led lines. A clock for the slot that exists and a calendar for the
        day being asked for tell the two apart without reading them.
      */}
      {hasWhen ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          {request.appointment ? (
            <p className="flex items-start gap-1.5">
              <Icon name="clock" className="mt-0.5 size-3.5" />
              <span>
                {t('request.currentSlot', {
                  date: formatMediumDate(locale, request.appointment.date),
                  time: formatMinute(
                    locale,
                    request.appointment.date,
                    request.appointment.startMinute,
                  ),
                })}
              </span>
            </p>
          ) : null}

          {/*
            The day asked for. No time, because the client named none — their
            dietitian sets the hour when they approve it. Requests filed before
            that rule still carry one, and still show it.
          */}
          {request.preferredDate !== null ? (
            <p className="flex items-start gap-1.5">
              <Icon name="calendar" className="mt-0.5 size-3.5" />
              <span>
                {request.preferredStartMinute === null
                  ? t('request.preferredDay', {
                      date: formatMediumDate(locale, request.preferredDate),
                    })
                  : t('request.preferredSlot', {
                      date: formatMediumDate(locale, request.preferredDate),
                      time: formatMinute(locale, request.preferredDate, request.preferredStartMinute),
                    })}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        The client's own words, set plainly — no sunken fill, no label. The
        card's title already says this is a message, and on the other kinds the
        sentence explains itself.
      */}
      {request.note ? (
        <p className="text-sm leading-relaxed whitespace-pre-line">{request.note}</p>
      ) : null}
    </div>
  );
}
