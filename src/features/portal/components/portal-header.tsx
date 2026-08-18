'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';

import { Icon } from '@/components/ui/icon';
import { signOutAction } from '@/features/auth/actions';
import { PortalNotificationsBell } from '@/features/portal/components/portal-notifications-bell';
import { type GreetingKey } from '@/features/portal/greeting';
import { type PortalNotification } from '@/features/portal/notifications';
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

/**
 * The default feed: none.
 *
 * A module constant rather than a `[]` default in the signature, because the
 * ids are memoised off it — a fresh array literal on every render would be a
 * fresh dependency, and the memo would never hold.
 */
const NO_NOTIFICATIONS: readonly PortalNotification[] = [];

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
 * of notifications this browser has not seen yet, and opens the feed in a
 * popover over whatever tab the client is on — see `PortalNotificationsBell`
 * for why that stopped being a screen of its own.
 *
 * It was a red disc drawn straight off a server count of unanswered requests,
 * and that had both halves wrong. The count was of a different thing than what
 * it opened, and — being a fact about the clinic's queue rather than about the
 * reader — nothing the client did could clear it: one request left unanswered
 * lit the same dot every day for a week. A badge that survives being read stops
 * meaning anything, and a client learns to ignore the bell. The count now comes
 * from `loadPortalNotifications`, the same loader that fills the panel, and
 * opening it marks it read — see `useSeen` for where "read" is kept and why it
 * cannot be in the database.
 *
 * **The trailing control is settings, not a menu.** There is no drawer:
 * profile is already a tab, and settings is one tap away instead of two.
 * Before the password change (`showNav` false) settings would only bounce
 * back to `set-password`, so this slot signs the client out directly instead
 * — the one thing they still need a way to do from a screen they cannot
 * leave any other way.
 */
/**
 * The header's one remaining link.
 *
 * It used to serve the bell too, which is why it carries an `enabled` flag and
 * an `onClick`: the bell was a link that marked its feed read on the way out
 * and rendered inert before the password change. The bell is a popover now
 * (`PortalNotificationsBell`) and settings is the only destination left, so the
 * `href` union has one member — kept as a union so adding a second is still a
 * compile-checked route rather than a string.
 */
function Destination({
  href,
  enabled,
  className,
  label,
  onClick,
  children,
}: {
  href: '/portal/settings';
  enabled: boolean;
  className: string;
  label: string;
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
  notifications = NO_NOTIFICATIONS,
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
   * The client's whole feed right now, from `loadPortalNotifications`.
   *
   * **The rows, not their ids.** It used to be `notificationIds` — a number was
   * never enough, because the badge counts what has *not been seen* and that is
   * a set difference rather than a subtraction (see `useSeen` above), but ids
   * were all the bell needed while tapping it navigated to a screen that loaded
   * the feed again. The feed now opens in a popover from this header, so the
   * rows have to arrive with it; `loadPortalNotifications` was already being
   * called in `(tabs)/layout.tsx` for the badge, so this costs the payload of
   * at most eight short rows and no extra query.
   *
   * Optional, and empty by default: `set-password` mounts this header with
   * `showNav={false}` and no feed at all.
   */
  notifications?: readonly PortalNotification[];
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
  // Derived rather than passed: the feed arrives as rows now, and both the
  // count above and the mark written on open are about the same set of ids.
  const notificationIds = useMemo(
    () => notifications.map((item) => item.id),
    [notifications],
  );

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
        {/*
          `justify-end` before the password change, because there is no bell on
          that screen to sit opposite — see the note below. `justify-between`
          with a single child would park sign-out on the leading edge, where the
          bell used to be.
        */}
        <div className={cn('flex items-center', showNav ? 'justify-between' : 'justify-end')}>
          {/*
            **The feed opens over the page, not as one.**

            This was a `<Link>` to `/portal/notifications`, a screen with a back
            control and four one-line rows on it. That route is gone;
            `PortalNotificationsBell` has the whole argument for why, and is the
            portal's use of the same inbox shell the practitioner bell already
            opens.

            `showNav` still decides whether there is a control here at all: a
            client who has not replaced their temporary password can reach one
            page, and a bell offering them a feed they cannot leave to act on is
            the same dead end the link was. There used to be an inert disc in
            its place, which was worse than nothing — a bell that looks pressable
            and answers nothing reads as broken, and on the one screen a client
            cannot leave it is the last thing to draw their eye. Nothing renders
            there now; the row switches to `justify-end` so sign-out keeps its
            corner.

            The badge is no longer drawn here. It is the shared trigger's own
            count disc, given the portal's fill and ring through
            `badgeClassName` — including the `9+` cap, which that component
            already applies for the same reason this one did: three digits on a
            16px disc either shrink the type under the floor or push the pill
            off the bell.

            **Opening it is reading it.** `markSeen` runs when the panel opens
            rather than on the way to a route, which is the same moment as
            before and a truer one — the rows are on screen by then. Everything
            currently on the feed is marked, not only what was unread: the
            client is about to look at the whole list, and a badge that survives
            being read is the thing this store exists to fix.
          */}
          {showNav ? (
            <PortalNotificationsBell
              items={notifications}
              unread={unreadCount}
              onOpen={() => markSeen(notificationIds)}
              /*
                The portal's bell: a bare 44px disc that takes the header's own
                tone, rather than the shared trigger's bordered grey box. It
                clears the default's border, fill and size — see the note on
                `triggerClassName`, and on `iconTone` above for why this turns
                white on the home tab alone.
              */
              triggerClassName={cn(
                'size-11 rounded-full border-transparent bg-transparent shadow-none',
                iconTone,
              )}
            />
          ) : null}

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
