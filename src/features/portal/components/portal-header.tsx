'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';

import { Icon } from '@/components/ui/icon';
import { signOutAction } from '@/features/auth/actions';
import { type GreetingKey } from '@/features/portal/greeting';
import { Link, usePathname } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Which notifications this browser has already been shown, kept across reloads.
 *
 * ⚠ **There is no read state in the database, and there cannot be one.** Every
 * row in this feed is derived at request time from a record that exists for its
 * own reason — an appointment, this week's plan, today's adherence, a request
 * the dietitian answered (`features/portal/notifications.ts`). There is no
 * notification row to mark. "Read" is therefore a fact about *this reader on
 * this device*, and `localStorage` is the honest place to keep it. On a shared
 * phone that is also the limit of it, which is the limit every browser-side seen
 * mark has.
 *
 * Ids rather than a count, which is what makes the badge come *back*. A count
 * cannot tell "one answered, one arrived" from "nothing happened" — the total is
 * the same both times, and the client would never be told about the new one.
 * Comparing ids means the badge lights for anything that was not on screen last
 * time and stays quiet for everything that was.
 *
 * The staff bell solves the identical problem the identical way
 * (`features/notifications/components/notifications-bell.tsx`); the two are
 * deliberately not shared, because that one is a popover over a clinic's queue
 * and this one is a link to a client's own screen, and the only thing they have
 * in common is the storage trick.
 */
const SEEN_STORAGE_KEY = 'iz.portal.notifications.seen';

const NOTHING_SEEN: readonly string[] = [];

const seenListeners = new Set<() => void>();

/*
  The last raw string read out of the store, and what it parsed to.

  `useSyncExternalStore` compares snapshots by identity and re-reads on every
  render, so a getter that parsed the JSON afresh each time would hand back a new
  array every time and loop forever. The cache keeps the snapshot stable for as
  long as the underlying string is.
*/
let seenRaw: string | null = null;
let seenValue: readonly string[] = NOTHING_SEEN;

/**
 * What was marked when the store would not take it — a private window, a full
 * quota. It wins over whatever `localStorage` says, so the badge still clears
 * for this session; it is simply forgotten on reload.
 */
let seenFallback: readonly string[] | null = null;

function parseSeen(raw: string | null): readonly string[] {
  if (!raw) return NOTHING_SEEN;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return NOTHING_SEEN;

    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    // Something else wrote the key, or it was truncated. "Nothing seen" is the
    // safe reading: it lights the badge rather than silencing it.
    return NOTHING_SEEN;
  }
}

function readSeen(): readonly string[] {
  if (seenFallback !== null) return seenFallback;

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
  } catch {
    // Disabled or partitioned storage. The bell still works, it just forgets.
    return NOTHING_SEEN;
  }

  if (raw !== seenRaw) {
    seenRaw = raw;
    seenValue = parseSeen(raw);
  }

  return seenValue;
}

function subscribeToSeen(onChange: () => void) {
  seenListeners.add(onChange);
  // `storage` fires in the *other* tabs, which is exactly the case the local
  // listener set does not cover: read the bell in one tab and the second one's
  // badge should go quiet too.
  window.addEventListener('storage', onChange);

  return () => {
    seenListeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/*
  The server snapshot is `null`, not `[]`, and the difference is what stops the
  badge lying for one frame.

  `[]` would mean "nothing has been seen", so a client who has read everything
  would get the full count painted server-side and then watch it drop to nothing
  a frame later. `null` means "we do not know yet", and `unreadCount` reads it as
  zero — so the badge starts absent and appears only if something really is
  unread. A number that arrives beats a number that arrives and then corrects
  itself downwards.
*/
function useSeen() {
  const seen = useSyncExternalStore(subscribeToSeen, readSeen, () => null);

  const markSeen = useCallback((ids: readonly string[]) => {
    const raw = JSON.stringify(ids);

    try {
      window.localStorage.setItem(SEEN_STORAGE_KEY, raw);
      // Prime the cache with what was just written, so the next read is a
      // string comparison rather than another parse.
      seenRaw = raw;
      seenValue = ids;
    } catch {
      seenFallback = ids;
    }

    seenListeners.forEach((listener) => listener());
  }, []);

  return { seen, markSeen };
}

/**
 * The portal's own header: who you are and what day it is, rather than the
 * app's name.
 *
 * The greeting, the name and the date all show only on the home tab —
 * `isHome` below, keyed off `usePathname`. This header is shared chrome
 * across all five portal screens, and the other four are each already
 * identified by their own title or content, so repeating "Good evening,
 * <name>" on every one of them said nothing a screen didn't already say for
 * itself. The date used to live on the week strip's own heading row instead,
 * one section down; it moved up here so it reads on the same line as the
 * name, matching the current design.
 *
 * **The bell means something, and it can be answered.** It carries the number
 * of notifications this browser has not seen yet, and opens the standalone
 * notifications screen — its own pushed screen, not a tab, so it can be read and
 * backed out of without losing the tab the client was on.
 *
 * It was a red disc drawn straight off a server count of unanswered requests,
 * and that had both halves wrong. The count was of a different thing than the
 * screen it opened, and — being a fact about the clinic's queue rather than
 * about the reader — nothing the client did could clear it: one request left
 * unanswered lit the same dot every day for a week. A badge that survives being
 * read stops meaning anything, and a client learns to ignore the bell. The
 * count now comes from `loadPortalNotifications`, the same loader that screen
 * uses, and clicking marks it read — see `useSeen` for where "read" is kept and
 * why it cannot be in the database.
 *
 * **The trailing control is settings, not a menu.** There is no drawer:
 * profile is already a tab, and settings is one tap away instead of two.
 * Before the password change (`showNav` false) settings would only bounce
 * back to `set-password`, so this slot signs the client out directly instead
 * — the one thing they still need a way to do from a screen they cannot
 * leave any other way.
 */
function Destination({
  href,
  enabled,
  className,
  label,
  onClick,
  children,
}: {
  href: '/portal/notifications' | '/portal/settings';
  enabled: boolean;
  className: string;
  label: string;
  /** Fired on the way out — the bell marks its feed read with it. */
  onClick?: () => void;
  children: React.ReactNode;
}) {
  if (!enabled) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link href={href} aria-label={label} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}

/** Sign-out as the header's trailing icon, for the one screen with no settings to send it to. */
function HeaderSignOut({ locale }: { locale: Locale }) {
  const t = useTranslations('common');

  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <HeaderSignOutSubmit label={t('signOut')} />
    </form>
  );
}

function HeaderSignOutSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-50"
    >
      {/* `signOut` mirrors itself — see DIRECTIONAL in `icon.tsx`. */}
      <Icon name="signOut" className="size-5.5" />
    </button>
  );
}

export function PortalHeader({
  name,
  greeting,
  date,
  notificationIds = NOTHING_SEEN,
  locale,
  showNav,
}: {
  name: string;
  greeting: GreetingKey;
  /**
   * Today's date, already formatted in the active locale. Shown beside the
   * name, but only on the home tab — like the greeting and name themselves,
   * see `isHome` below. Optional because `set-password`, the one caller
   * outside the tab group, is never the home route and so never needs to
   * compute it.
   */
  date?: string;
  /**
   * The ids of every notification on `/portal/notifications` right now, from
   * `loadPortalNotifications` — the same list the screen itself renders.
   *
   * Ids rather than a number, because the badge counts what has *not been seen*
   * and that is a set difference, not a subtraction. See `useSeen` above.
   */
  notificationIds?: readonly string[];
  locale: Locale;
  /**
   * False while the client still owes us a password change. `(secured)/layout`
   * explains the rule: every portal route redirects back to `set-password`
   * until then, so the bell and settings link stay off and sign-out takes
   * their slot instead.
   */
  showNav: boolean;
}) {
  const t = useTranslations('portal.header');
  const tMenu = useTranslations('portal.menu');
  const pathname = usePathname();
  const isHome = pathname === '/portal';

  const { seen, markSeen } = useSeen();

  /*
    How many notifications have arrived since this browser last opened the
    screen.

    `seen === null` is the server render and the first client render, where the
    store has not been read yet — zero, so the badge is absent rather than wrong
    (see the note on `useSeen`'s server snapshot).
  */
  const unreadCount = useMemo(() => {
    if (seen === null) return 0;

    const seenIds = new Set(seen);
    return notificationIds.filter((id) => !seenIds.has(id)).length;
  }, [seen, notificationIds]);

  /*
    **White chrome on home, ordinary foreground everywhere else.**

    The home tab is the only one with the glow behind it, and the bar is
    unfilled there (see the note on `<header>` below) — so the bell and the
    gear are sitting on the green wash rather than on a white card, and white
    is what reads on it. The other four tabs keep `bg-card`, where a white
    glyph would be a glyph you cannot see; they stay on `text-foreground`.

    The hover fill follows the same split for the same reason: `bg-muted` is a
    cool grey that shows as a smudge over the wash, so on home the press target
    tints with white at 15% instead.
  */
  /*
    ⚠ **The white only holds while the glow is behind it**, and that is the one
    thing to check before adding a breakpoint here. `HomeGlow` was `md:hidden`
    for a while and this was not, so from 768px up the bell and the gear
    rendered, took their space, stayed keyboard-reachable — and were white on a
    white page. The only trace was the bell's own antialiasing.

    The glow now runs at every width, so this does too: no `md:`/`lg:` variant
    on either, which is what keeps them impossible to get out of step.
  */
  const iconTone = isHome ? 'text-white hover:bg-white/15' : 'text-foreground hover:bg-muted';

  return (
    /*
      **On the home tab the bar is unfilled, and that is what lets the glow
      reach the top of the screen.** `HomeGlow` paints behind everything at
      `-z-10`; an opaque `bg-card` here was a white band across the first 120px
      of the page, so the green appeared to start below the greeting rather
      than behind it. Dropping the fill on that one tab is also what
      §Navigation already specifies for this bar — "deliberately unfilled: no
      background, no border, no elevation. The page's own cards carry the
      weight."

      The other four tabs keep the fill. They have no glow to reveal, so an
      unfilled bar there would only be a header that had lost the separation
      from the content underneath.
    */
    /*
      `md:px-6` matches `main`'s own `px-4 md:px-6` in `(tabs)/layout.tsx`.
      Both cap at `max-w-3xl` and centre, and they now share the same parent
      box — but until the box is wider than the cap plus its padding, the
      column's position still depends on that padding. Matching it is what
      keeps the greeting sitting exactly over the cards at every tablet width
      rather than only once both columns reach 768px.
    */
    <header
      className={cn(
        'px-4 pt-3 pb-4 md:px-6',
        // Unfilled on home at every width, so the glow reaches the top of the
        // screen. The other four tabs have no glow to reveal, so an unfilled
        // bar there would only be a header that lost its separation from the
        // content underneath.
        isHome ? 'bg-transparent' : 'bg-card',
      )}
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between">
          <Destination
            href="/portal/notifications"
            enabled={showNav}
            label={
              unreadCount > 0
                ? t('notificationsWaiting', { count: unreadCount })
                : t('notifications')
            }
            /*
              Opening it is reading it. The mark is written on the way out
              rather than by the screen it navigates to, for two reasons: this
              is where the id list already is, and the badge should go quiet
              under the thumb rather than a route transition later.

              Everything currently on the feed is marked, not only what was
              unread — the client is about to look at the whole list, and a
              badge that survived being read is the thing being fixed here.
            */
            onClick={() => markSeen(notificationIds)}
            className={cn(
              'relative flex size-11 items-center justify-center rounded-full transition-colors',
              iconTone,
            )}
          >
            <Icon name="notifications" className="size-5.5" />

            {unreadCount > 0 ? (
              /*
                **The count, not a disc.**

                It was a 10px dot, which answered "is there anything?" and
                nothing else — and because it was drawn straight off a server
                count of unanswered requests, it could not go out until the
                clinic acted. Reading the screen did nothing to it. A client
                with one request pending saw the same red mark for a week.

                A number says how much is waiting *and* is a thing that can be
                cleared, which is the whole point of the seen mark behind it.

                `9+` above nine: the badge is 18px on a 44px target, and three
                digits either shrink the type under the floor or push the pill
                off the bell. Past nine the exact figure is not what the client
                needs from a glyph in a corner — the screen behind it has the
                list.

                `ring-card` on every tab including home, where the header is
                unfilled over the glow: the ring is what separates the pill from
                the bell under it, and against the green wash a white-ish ring
                still reads as a gap rather than as part of the badge. The fill
                is the same complete-mark green the dot used, which is already
                the portal's "something for you" colour.
              */
              <span
                aria-hidden
                className="absolute top-1.5 end-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-status-complete-mark px-1 text-[0.625rem] leading-none font-semibold text-white ring-2 ring-card tabular-nums"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </Destination>

          {showNav ? (
            <Destination
              href="/portal/settings"
              enabled
              label={tMenu('settings')}
              className={cn('flex size-11 items-center justify-center rounded-full transition-colors', iconTone)}
            >
              <Icon name="settings" className="size-5.5" />
            </Destination>
          ) : (
            <HeaderSignOut locale={locale} />
          )}
        </div>

        {isHome ? (
          <div className="mt-2">
            {/*
              The greeting and the name go white, against the glow this header
              is deliberately unfilled over — see `iconTone` above. Only the
              home tab draws this block at all, so there is no second surface
              to check them against.
            */}
            <p className="flex items-center gap-1.5 text-sm text-white">
              {t(`greeting.${greeting}`)}
              <Icon name="greetingSun" className="size-4 text-status-complete-mark-soft" />
            </p>

            {/*
              `items-baseline`, not `items-center`: the date chip is much
              smaller than the name, and centring the two vertically would sit
              the chip noticeably above the name's own baseline instead of
              resting on the same line as its text.
            */}
            <p className="flex items-baseline justify-between gap-3">
              <span className="truncate font-heading text-xl font-semibold text-white">{name}</span>

              {date ? (
                <span className="shrink-0 text-xs font-medium text-white">{date}</span>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>
    </header>
  );
}
