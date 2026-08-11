'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import {
  NotificationInboxItem,
  NotificationInboxPopover,
  notificationInboxItemLinkVariants,
  type InboxTone,
} from '@/components/ui/notification-inbox-popover';
import {
  type AttentionReason,
  type StaffAttentionNotification,
} from '@/features/notifications/types';
import { type PendingRequests } from '@/features/requests/types';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatTimeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The notifications inbox, behind the bell beside the date on the dashboard.
 *
 * ## Why this is a bell again
 *
 * The feed used to be a page reached from a menu at the foot of the rail — two
 * deliberate acts away from the screen a dietitian actually keeps open, and a
 * notification nobody goes looking for is not a notification. It was then a card
 * on the dashboard, which found the opposite limit: the dashboard is one screen,
 * and a permanent panel listing three names spent a column on something read
 * once a morning and then irrelevant until it changes.
 *
 * A bell is the right size for that. It costs one glyph when there is nothing,
 * says how many when there is, and opens the whole list on a click. The page it
 * links to is still where the full feed lives — this is the way *in*, not a
 * second copy of it.
 *
 * ## Where the parts live
 *
 * The panel itself — trigger, count, filter strip, scroll area, footer — is
 * `NotificationInboxPopover` in `components/ui`. This file is the half that
 * knows what a clinic notification *is*: which query each row came from, which
 * glyph names it, and where clicking it goes. The shared layer must not depend
 * on routing, so the `<Link>` around each row is composed here.
 *
 * ## What this is not
 *
 * **No row is ever dismissed.** Nothing here is a stored notification: every row
 * is derived live from a pending request or from a client record that has gone
 * quiet, which is the design `loadStaffAttention` and
 * `src/features/portal/notifications.ts` both document. A row leaves when the
 * *thing* stops being true — the request is answered, the plan is written — not
 * when someone looks at it. Hiding a fact that is still waiting is the one
 * behaviour an inbox must not have.
 *
 * **The badge is the exception, and only the badge.** Opening the panel is
 * reading it, so the count clears — see `useSeen` below. The red disc answers
 * "is there anything I have not looked at", which is a question about the
 * *reader*; the list answers "what is still outstanding", which is a question
 * about the clinic. Keeping the count lit over a list someone has already read
 * three times is how a notification badge stops meaning anything.
 */

/**
 * What has been looked at, remembered across reloads.
 *
 * Per browser rather than per account: a read mark is a fact about a person's
 * attention, not about the clinic, and there is no notification row in the
 * database to hang one off — every item in this panel is derived by a query at
 * request time. `localStorage` is the honest place for it. On a machine two
 * staff share it is also the limit of it, which is the same limit every other
 * "seen" mark in a browser has.
 *
 * `useSyncExternalStore`, not state seeded in an effect. `localStorage` *is* an
 * external store — it is written by another tab as readily as by this one — and
 * the hook is the one way to read one that has no server value without either
 * hydrating a badge the server did not draw or kicking off a second render from
 * inside an effect. The server snapshot is `null`, so the disc starts absent and
 * appears a frame later if anything is unread: a count that pops in beats a count
 * that pops in and then corrects itself downwards.
 */
const SEEN_STORAGE_KEY = 'iz.notifications.seen';

type Seen = {
  /** The row ids on screen the last time the panel was opened. */
  ids: string[];
  /**
   * …and how many attention rows the query had found beyond the cap at that
   * moment. Those have no id here to remember, and without this the overflow
   * below would keep the badge lit forever.
   */
  overflow: number;
};

const NOTHING_SEEN: Seen = { ids: [], overflow: 0 };

const seenListeners = new Set<() => void>();

/*
  The last raw string read out of the store, and what it parsed to.

  `useSyncExternalStore` compares snapshots by identity and re-reads on every
  render, so a getter that parsed the JSON afresh each time would hand back a new
  object every time and loop forever. The cache makes the snapshot stable for as
  long as the underlying string is.
*/
let seenRaw: string | null = null;
let seenValue: Seen = NOTHING_SEEN;

/**
 * What was marked when the store would not take it — a private window, a full
 * quota. It wins over whatever `localStorage` says, so the badge still clears
 * for this session; it is simply forgotten on reload.
 */
let seenFallback: Seen | null = null;

function parseSeen(raw: string | null): Seen {
  if (!raw) return NOTHING_SEEN;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || !Array.isArray((parsed as Seen).ids)) {
      return NOTHING_SEEN;
    }

    return {
      ids: (parsed as Seen).ids.filter((id): id is string => typeof id === 'string'),
      overflow: Number((parsed as Seen).overflow) || 0,
    };
  } catch {
    // Something else wrote the key, or it was truncated. "Nothing seen" is the
    // safe reading: it lights the badge rather than silencing it.
    return NOTHING_SEEN;
  }
}

function readSeen(): Seen {
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
  // listener set does not cover: read the bell on one tab and the second one's
  // badge should go quiet too.
  window.addEventListener('storage', onChange);

  return () => {
    seenListeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function useSeen() {
  const seen = useSyncExternalStore(subscribeToSeen, readSeen, () => null);

  const markSeen = useCallback((next: Seen) => {
    const raw = JSON.stringify(next);

    try {
      window.localStorage.setItem(SEEN_STORAGE_KEY, raw);
      // Prime the cache with what was just written, so the next read is a
      // string comparison rather than another parse.
      seenRaw = raw;
      seenValue = next;
    } catch {
      seenFallback = next;
    }

    seenListeners.forEach((listener) => listener());
  }, []);

  return { seen, markSeen };
}

/** Which list a row belongs to — the same split `/app/notifications` makes. */
type Group = 'requests' | 'clients';
type Filter = 'all' | Group;

type Row = {
  id: string;
  group: Group;
  href: string;
  icon: IconName;
  tone: InboxTone;
  name: string;
  message: string;
  /** Requests carry an age; an attention flag has no moment it happened at. */
  time: string | null;
};

const REQUEST_ICON = {
  new: 'bookAppointment',
  reschedule: 'refresh',
  cancel: 'close',
} as const satisfies Record<string, IconName>;

const CLIENT_REQUEST_ICON = {
  data_update: 'edit',
  account_deletion: 'archive',
} as const satisfies Record<string, IconName>;

/**
 * A glyph per reason, so three rows that all mean "this client has gone quiet"
 * are told apart before the sentence is read.
 */
const ATTENTION_ICON: Record<AttentionReason, IconName> = {
  noUpcomingAppointment: 'calendar',
  noWeeklyPlan: 'weeklyPlans',
  neverSignedIn: 'person',
};

export function NotificationsBell({
  attention,
  attentionTotal,
  requests,
  locale,
  now,
}: {
  attention: StaffAttentionNotification[];
  /** Everything the query found, not just the rows shown — the count must not lie. */
  attentionTotal: number;
  requests: PendingRequests;
  locale: Locale;
  /** The one instant every "10 minutes ago" in the panel is measured against. */
  now: Date;
}) {
  const t = useTranslations('notifications');
  const tRequests = useTranslations('requests');

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const { seen, markSeen } = useSeen();

  const rows = useMemo<Row[]>(
    () => [
      ...requests.appointments.map((item) => ({
        id: `appointment-${item.id}`,
        group: 'requests' as const,
        href: '/app/requests',
        icon: REQUEST_ICON[item.kind],
        tone: 'attention' as const,
        name: item.clientName,
        message: tRequests(`kind.${item.kind}`),
        time: formatTimeAgo(locale, item.createdAt, now),
      })),
      ...requests.clientRequests.map((item) => ({
        id: `client-request-${item.id}`,
        group: 'requests' as const,
        href: '/app/requests',
        icon: CLIENT_REQUEST_ICON[item.kind],
        tone: 'attention' as const,
        name: item.clientName,
        message: tRequests(`clientKind.${item.kind}`),
        time: formatTimeAgo(locale, item.createdAt, now),
      })),
      ...attention.map((item) => ({
        id: `attention-${item.id}`,
        group: 'clients' as const,
        href: `/app/clients/${item.clientId}`,
        icon: ATTENTION_ICON[item.reason],
        tone: 'incomplete' as const,
        name: item.clientName,
        message: t(`attention.${item.reason}`),
        time: null,
      })),
    ],
    [requests, attention, locale, now, t, tRequests],
  );

  const requestCount = requests.appointments.length + requests.clientRequests.length;

  /*
   * The attention rows the query found beyond what it returned. They still have
   * to be counted — the list is capped and the number on the bell is not allowed
   * to shrink to match a cap the reader cannot see — but they arrive with no id,
   * so "have I seen these" is a comparison of totals rather than of rows.
   */
  const overflow = Math.max(attentionTotal - attention.length, 0);

  /*
   * How many things are waiting that nobody has looked at yet.
   *
   * Not `rows.length + overflow`: the panel's whole list is marked seen the
   * moment it is opened, so this counts what has arrived *since*. It stays 0
   * until the effect has read the store — see `useSeen`.
   */
  const unseenCount = useMemo(() => {
    if (seen === null) return 0;

    const seenIds = new Set(seen.ids);

    return (
      rows.filter((row) => !seenIds.has(row.id)).length + Math.max(overflow - seen.overflow, 0)
    );
  }, [seen, rows, overflow]);

  const visible = filter === 'all' ? rows : rows.filter((row) => row.group === filter);

  return (
    <NotificationInboxPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        /*
         * Opening it is reading it — the count clears on the way in rather than
         * on the way out, because the reader is looking at the list right now
         * and a badge still lit over an open panel is the bell arguing with
         * itself. Everything on screen is marked, not just the active filter:
         * the tabs are a view of one list, and a row hidden behind "Requests"
         * was still delivered.
         */
        if (next) markSeen({ ids: rows.map((row) => row.id), overflow });
      }}
      title={t('title')}
      // The panel's own heading keeps saying how much is outstanding; only the
      // disc on the bell answers to having been read.
      count={requestCount + attentionTotal}
      unread={unseenCount}
      tabsLabel={t('tabs.label')}
      activeTab={filter}
      onTabChange={setFilter}
      /*
       * Each tab counts what *exists*, not what this panel happens to be
       * holding.
       *
       * "Clients" read `attention.length` and "All" read `rows.length`, which
       * are the rows after `loadStaffAttention`'s cap — four. So a clinic with
       * four clients needing attention and a clinic with thirty both showed a 4,
       * and the number stopped moving no matter what changed underneath: a
       * figure that looks hardcoded because it effectively is. `attentionTotal`
       * is the count the query actually found, which is why it is passed down
       * separately from the rows.
       *
       * It leaves the counts able to exceed the list under them — the "Clients"
       * tab can say 12 over four rows. That is the honest way round: the footer
       * says where the rest are, and the alternative is a number that quietly
       * under-reports the clinic's workload.
       */
      tabs={[
        { value: 'all', label: t('tabs.all'), count: requestCount + attentionTotal },
        { value: 'requests', label: t('tabs.requests'), count: requestCount },
        { value: 'clients', label: t('tabs.clients'), count: attentionTotal },
      ]}
      empty={t('empty')}
      footer={
        /* The full feed, including everything this panel capped. */
        <Link
          href="/app/notifications"
          onClick={() => setOpen(false)}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full')}
        >
          {t('seeAll')}
          <Icon name="chevronEnd" className="size-4" />
        </Link>
      }
    >
      {visible.map((row) => (
        <li key={row.id}>
          <Link
            href={row.href}
            onClick={() => setOpen(false)}
            className={notificationInboxItemLinkVariants}
          >
            <NotificationInboxItem
              icon={row.icon}
              tone={row.tone}
              title={row.name}
              description={row.message}
              timestamp={row.time}
            />
          </Link>
        </li>
      ))}
    </NotificationInboxPopover>
  );
}
