'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/icon';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsSheetSurface } from '@/hooks/use-mobile';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { normalizeForSearch } from '@/features/clients/search';
import { cn } from '@/lib/utils';

import { formatDuration, formatLongDate, formatMinute, formatMinuteRange } from '../format';
import { patientToneStyle } from '../patient-color';
import { anchorPopover } from '../rtl';
import { type CalendarClient } from '../types';
import { findClientBooking, type ExistingAppointment } from '../validation';
import { NO_REPEAT, RepeatField } from './repeat-field';

/**
 * The popover that turns a dragged range into a booking.
 *
 * Clicking a client is what writes the appointment — there is no separate
 * "save". Until then nothing exists, so pressing Escape or clicking away leaves
 * the database exactly as it was.
 *
 * There is no practitioner control: the clinic has one, and it is the account
 * holder, so the server resolves it from the session rather than asking.
 */

export type PendingBooking = {
  date: string;
  startMinute: number;
  durationMinutes: number;
  pointer: { x: number; y: number };
};

export type ClientPickerProps = {
  pending: PendingBooking;
  locale: Locale;
  clients: CalendarClient[];
  /** Everything on the pending date, for the already-booked warnings. */
  existing: readonly ExistingAppointment[];
  /**
   * Whether this surface may create a client as well as book one.
   *
   * True in the day and week views alike — see the note at the call site for
   * why the week stopped being an exception. It is false only for a calendar
   * scoped to one client, where every booking is already for the person whose
   * page it is; there the button would be an offer the screen cannot honour, so
   * the capability is absent rather than merely discouraged.
   */
  allowNewClient: boolean;
  /** `weeks` is how many weekly repeats to add after this one — 0 for none. */
  onPick: (clientId: string, weeks: number) => void;
  /** Carries the repeat choice through to the new-client dialog. */
  onNewClient: (weeks: number) => void;
  onCancel: () => void;
};

const ROW_HEIGHT_PX = 40;

export function ClientPicker({
  pending,
  locale,
  clients,
  existing,
  allowNewClient,
  onPick,
  onNewClient,
  onCancel,
}: ClientPickerProps) {
  const t = useTranslations('booking');
  const direction = getLocaleDirection(locale);

  /*
    The same question the notifications inbox and the guided tour ask — width
    under 40rem, or a coarse pointer at any width. On a touch surface this
    picker rises from the block-end edge instead of hanging off the point the
    finger lifted from; see the class list on the panel below for why that is
    the right shape for a booking made with a thumb.
  */
  const asSheet = useIsSheetSurface();

  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  /**
   * How many weekly repeats to add — chosen here, before the booking exists,
   * rather than asked in a modal after it is saved. See `RepeatField`.
   */
  const [weeks, setWeeks] = useState(NO_REPEAT);
  const [position, setPosition] = useState<{ insetInlineStart: number; insetBlockStart: number } | null>(null);

  const endMinute = pending.startMinute + pending.durationMinutes;

  /** Who is already booked on this date, and with whom. */
  const bookings = useMemo(() => {
    const map = new Map<string, ExistingAppointment>();

    for (const client of clients) {
      const booking = findClientBooking(client.id, pending.date, existing);
      if (booking) map.set(client.id, booking);
    }

    return map;
  }, [clients, existing, pending.date]);

  const results = useMemo(() => {
    const needle = normalizeForSearch(query);
    if (!needle) return clients;
    return clients.filter((client) => normalizeForSearch(client.name).includes(needle));
  }, [clients, query]);

  /**
   * Position after measuring, not before: clamping needs the popover's real
   * size, and a width guessed from the content would put it half off screen on
   * a long client name. Hidden until measured, so there is no visible jump.
   *
   * ## And again whenever the viewport changes size
   *
   * `anchorPopover` takes the pointer that opened the picker and clamps the
   * panel inside the viewport it was measured against. That viewport is not a
   * constant on a phone or a tablet: turning the device swaps its two
   * dimensions outright, and the on-screen keyboard shortens it by half under
   * `interactiveWidget: 'resizes-content'` (see the `viewport` export in
   * `[locale]/layout.tsx`) the moment the search field takes focus.
   *
   * Measured once, the panel kept coordinates clamped to a viewport that no
   * longer existed — a picker opened near the foot of a portrait screen landed
   * off the bottom of the same screen turned sideways, with the half-made
   * booking it holds unreachable and no way back but dismissing it.
   *
   * Re-running the same clamp is the whole fix. The pointer is deliberately
   * *not* re-derived: the tap it records happened in the old viewport and there
   * is nothing to map it onto in the new one, so the honest behaviour is to
   * keep the panel as close to where the reader left it as the new screen
   * allows, which is exactly what clamping the old pointer does.
   *
   * Both events, because on a rotation they fire at different moments:
   * `orientationchange` as the turn begins and `resize` once the new dimensions
   * have settled. Running the clamp on each is two `getBoundingClientRect`
   * reads and a `setState` that no-ops when the answer has not moved, which is
   * cheaper than choosing wrong. `resize` alone still carries every other case
   * — the keyboard, an iPad split-view divider, a desktop window edge — and is
   * the same listener `meal-inspector.tsx` re-measures on.
   */
  useLayoutEffect(() => {
    const element = popoverRef.current;
    if (!element) return;

    /*
      None of this applies to the sheet. Its geometry is CSS — pinned to the
      block-end edge and centred on auto margins — so there is no pointer to
      clamp, nothing to measure, and no rotation case to re-measure for. Bailing
      here also leaves `position` null, which the sheet branch of the class list
      deliberately does not read: the anchored panel hides itself until measured
      and the sheet has nothing to wait for.
    */
    if (asSheet) return;

    function place() {
      const node = popoverRef.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();

      setPosition(
        anchorPopover(
          pending.pointer,
          { width: rect.width, height: rect.height },
          { width: window.innerWidth, height: window.innerHeight },
          direction,
        ),
      );
    }

    place();

    window.addEventListener('resize', place);
    window.addEventListener('orientationchange', place);

    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('orientationchange', place);
    };
  }, [asSheet, direction, pending.pointer]);

  /**
   * Outside-click, armed one tick late.
   *
   * The pointer-up that *opened* this popover is still travelling: attaching
   * synchronously would let that very event close it again, so the picker would
   * appear and vanish in the same gesture.
   */
  useEffect(() => {
    let dispose = () => {};

    const timer = setTimeout(() => {
      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target as Element | null;

        /*
          A click on the repeat list is not a click outside.

          That list portals onto `document.body` — `useDialogContainer` is null
          outside a dialog, and this popover is a plain `div`, not one — so its
          options are not descendants of `popoverRef` and the containment check
          below read choosing "every week" as a click away. It threw the booking
          out before anyone had picked a client, which is the one thing this
          popover exists to do. The same field inside `NewClientDialog` was
          always fine: there the list portals into the dialog.

          Containment, not merely "is a list mounted?" — Base UI leaves the
          popup in the DOM once it has been opened, so presence stays true for
          the rest of the popover's life and would disable this handler
          entirely. A closed popup is `display: none` on its positioner and
          `pointer-events: none`, so a real click can only land in an open one.
        */
        if (target?.closest('[data-slot="select-content"]')) return;

        /*
          And while that list is open, a click anywhere else belongs to it: it
          dismisses the list and leaves the half-made booking standing, so one
          click dismisses one thing. `aria-expanded` is the trigger's own live
          state, and the trigger is inside this popover, which keeps the
          question scoped to the list this popover opened.
        */
        if (popoverRef.current?.querySelector('[data-slot="select-trigger"][aria-expanded="true"]')) return;

        if (!popoverRef.current?.contains(target)) onCancel();
      };

      window.addEventListener('pointerdown', handlePointerDown);
      dispose = () => window.removeEventListener('pointerdown', handlePointerDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      dispose();
    };
  }, [onCancel]);

  /** Keep the highlighted row visible when the arrows walk past the fold. */
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  function move(delta: number): void {
    // Functional update: holding an arrow key fires faster than React commits,
    // and reading `highlight` from this render would repeatedly compute from a
    // stale index and appear stuck.
    setHighlight((current) => {
      if (results.length === 0) return 0;
      return (current + delta + results.length) % results.length;
    });
  }

  function commit(client: CalendarClient): void {
    if (bookings.has(client.id)) return;
    onPick(client.id, weeks);
  }

  /*
    ── Portalled to <body>, like every other overlay in the app ──

    This panel is `position: fixed`, and it was the last fixed overlay here
    rendered *in place*: `Dialog` portals (see `client-form-trigger.tsx`), and
    all four Base UI popups portal. Rendered inline it sat deep inside the
    calendar, which means its containing block was not the viewport but the
    nearest ancestor carrying a `transform`, `filter`, `backdrop-filter`,
    `perspective`, `contain: paint` or `will-change` on any of them — and the
    coordinates it computes come from `getBoundingClientRect`, which is measured
    against the viewport. When those two disagree the panel lands offset by the
    ancestor's own origin, and if that ancestor also clips (a `clip-path`, an
    `overflow` on a transformed box) it is not merely displaced but invisible.

    That is exactly the failure `.q-route-stage` was causing app-wide until the
    `animation-fill-mode` fix, and the four notes elsewhere in this codebase
    about working around that wrapper are the same bug found four times. A
    portal to `<body>` ends the whole class of it: there is no ancestor left
    between this element and the initial containing block, so no future
    `transform` added anywhere in the calendar can move or hide the picker
    again.

    `dir` is already set explicitly below, so leaving the calendar's subtree
    costs nothing — the panel never inherited direction from its parent.

    Guarded on `document` so the first server render, where there is no body to
    portal into, returns nothing rather than throwing.
  */
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('picker.title')}
      dir={direction}
      className={cn(
        'fixed z-50 flex flex-col gap-3 border-border bg-popover p-3',
        asSheet
          ? /*
              ── The touch surface: a sheet on the block-end edge ──

              Anchored to the pointer, this panel lands under the hand that just
              painted the range — which is exactly where a finger already is, so
              the finger covers the list it opened. `anchorPopover` then clamps
              it inside the viewport, and near the foot of a screen that means
              the panel jumps somewhere the reader did not press.

              Risen from the edge instead, it is where a thumb reaches, it is
              never underneath the hand, and it is the same shape every other
              interrupting surface in this app now takes on a touch device — the
              notifications inbox, the requests inbox, `Dialog`'s own sheet
              placement. The range stays visible on the grid above it, which is
              the one thing the anchored panel was buying and this keeps.

              28rem centred from `sm` up, the measure `--q-dialog-sheet-width`
              and the coarse-pointer popup rules in `globals.css` both settle on,
              so a tablet shows one width for every surface that interrupts it.
              `mx-auto` against the pinned inline insets centres it in a way that
              stays correct in RTL, where a translate would not.
            */
            cn(
              'inset-x-0 bottom-0 mx-auto w-full rounded-t-2xl border-t shadow-overlay',
              'sm:max-w-[28rem]',
              'pb-[calc(0.75rem+var(--q-safe-b))]',
            )
          : cn('w-80 max-w-[calc(100vw-1rem)] rounded-xl border shadow-xl', position ? 'visible' : 'invisible'),
      )}
      style={
        asSheet
          ? undefined
          : { insetInlineStart: position?.insetInlineStart ?? 0, insetBlockStart: position?.insetBlockStart ?? 0 }
      }
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
          return;
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          const client = results[highlight];
          if (client) commit(client);
        }
      }}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-0.5 text-start">
          <p className="text-sm font-semibold" dir="auto">
            {formatMinuteRange(locale, pending.date, pending.startMinute, endMinute)}
            <span className="ms-2 font-normal text-muted-foreground">
              {formatDuration(pending.durationMinutes, {
                hour: (n) => t('duration.hours', { count: n }),
                minute: (n) => t('duration.minutes', { count: n }),
              })}
            </span>
          </p>
          <p className="text-xs text-muted-foreground" dir="auto">
            {formatLongDate(locale, pending.date)}
          </p>
        </div>

        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label={t('actions.close')}>
          <Icon name="close" />
        </Button>
      </header>

      {/*
        The repeat, chosen with the slot rather than asked about afterwards. It
        sits above the client list because it describes the *appointment*, and
        the list below is the act of saving it — clicking a name is what writes
        the row, so everything that shapes the row belongs before it.
      */}
      <RepeatField
        locale={locale}
        date={pending.date}
        weeks={weeks}
        onChange={setWeeks}
        idPrefix="picker-repeat"
      />

      <Input
        autoFocus
        type="search"
        icon="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          // Reset here rather than in an effect on `query`: a filtered list
          // can be shorter than the highlight that was on screen, and the
          // event that shortened it is the right place to fix it — an effect
          // would render one frame with the stale index first.
          setHighlight(0);
        }}
        placeholder={t('picker.searchPlaceholder')}
        aria-label={t('picker.searchPlaceholder')}
      />

      <ul ref={listRef} className="max-h-56 overflow-y-auto" role="listbox" aria-label={t('picker.clients')}>
        {results.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">{t('picker.noMatches')}</li>}

        {results.map((client, index) => {
          const booking = bookings.get(client.id);
          const isBooked = booking !== undefined;

          return (
            <li key={client.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                data-highlighted={index === highlight}
                disabled={isBooked}
                // A tooltip that can be read before clicking, rather than a
                // rejection afterwards.
                title={
                  booking
                    ? t('picker.alreadyBookedAt', {
                        time: formatMinute(locale, booking.date, booking.startMinute),
                      })
                    : undefined
                }
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 text-start transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-45',
                  index === highlight && !isBooked && 'bg-muted',
                )}
                style={{ height: ROW_HEIGHT_PX }}
                // Hover moves the highlight, so the mouse and the keyboard never
                // disagree about which row Enter would book.
                onPointerEnter={() => setHighlight(index)}
                onClick={() => commit(client)}
              >
                {/*
                  The client's calendar colour, not the hex on their record.

                  `clients.color` is a stored `#rrggbb` and predates the tone
                  ramp. Every other surface in this feature — the week block, the
                  month chip, the agenda row — draws a person from `clientSeq`
                  through `.patient-tone`, whose four steps are OKLCH, so the
                  picker was the one place a client appeared in a different
                  colour from the appointment it was about to create. Sitting in
                  the list you book from, that is the worst place for it: the
                  colour is how you recognise the person, and it changed the
                  moment you clicked.

                  `--tone-mark` is the deep step, built for exactly this disc and
                  measured to hold white initials at 4.63–5.09:1 across all 360
                  hues — see the note in `globals.css`. The hex has no such
                  guarantee; nothing constrains it to a lightness that white
                  survives.
                */}
                <span className="patient-tone contents" style={patientToneStyle(client.seq)}>
                  <Avatar name={client.name} color="var(--tone-mark)" size="sm" />
                </span>

                <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
                  {client.name}
                </span>

                {booking && (
                  <span className="shrink-0 text-label text-muted-foreground" dir="auto">
                    {formatMinute(locale, booking.date, booking.startMinute)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        Nothing in the other branch, where there used to be "to add someone new,
        open the day view". That line was directions out of the week view, and
        the week no longer needs directing anywhere. The only surface left
        without the button is a calendar scoped to a single client, where the
        sentence would be actively wrong — the day view of that page cannot add
        anyone either, because the page is about one person by construction.
      */}
      {allowNewClient ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onNewClient(weeks)} className="justify-start">
          <Icon name="add" data-icon="inline-start" />
          {t('picker.newClient')}
        </Button>
      ) : null}
    </div>,
    document.body,
  );
}
