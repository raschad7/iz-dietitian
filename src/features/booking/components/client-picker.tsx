'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { normalizeForSearch } from '@/features/clients/search';
import { cn } from '@/lib/utils';

import { formatDuration, formatLongDate, formatMinute, formatMinuteRange, initialsOf } from '../format';
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
   * Whether this view may create a client as well as book one.
   *
   * False in the week view: booking there picks from people already on the
   * register, and taking someone's details is a day-view job where there is room
   * to do it properly. With no button there is nothing to press by mistake —
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
   */
  useLayoutEffect(() => {
    const element = popoverRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();

    setPosition(
      anchorPopover(
        pending.pointer,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
        direction,
      ),
    );
  }, [direction, pending.pointer]);

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
        if (!popoverRef.current?.contains(event.target as Node)) onCancel();
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

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('picker.title')}
      dir={direction}
      className={cn(
        'fixed z-50 flex w-80 max-w-[calc(100vw-1rem)] flex-col gap-3 rounded-xl border border-border bg-popover p-3 shadow-xl',
        position ? 'visible' : 'invisible',
      )}
      style={{ insetInlineStart: position?.insetInlineStart ?? 0, insetBlockStart: position?.insetBlockStart ?? 0 }}
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

      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          type="search"
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
          className="ps-8"
        />
      </div>

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
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-label font-semibold text-white"
                  style={{ background: client.color }}
                >
                  {initialsOf(client.name)}
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

      {allowNewClient ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onNewClient(weeks)} className="justify-start">
          <Icon name="add" data-icon="inline-start" />
          {t('picker.newClient')}
        </Button>
      ) : (
        // Says where to go rather than leaving a dead end, for the case that
        // matters: the person in front of you is not on the register yet.
        <p className="text-label text-muted-foreground">{t('picker.newClientInDayView')}</p>
      )}
    </div>
  );
}
