import { type ReactNode } from 'react';

import { toIsoDate } from '@/features/booking/date';
import { formatLongDate } from '@/features/booking/format';
import { NotificationsBell } from '@/features/notifications/components/notifications-bell';
import { loadStaffAttention } from '@/features/notifications/page-data';
import { type StaffAttentionNotification } from '@/features/notifications/types';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The one header every staff screen opens with: what the screen is on the
 * reading side, today's date and the notification bell on the other.
 *
 * It started as the dashboard's own title row — "Welcome, {name}" beside the
 * date and the bell — and stayed there while the register, the calendar, the
 * planner and the catalog each grew a different first line. The bell was the
 * problem that made one component out of four: attention notifications are read
 * once a morning, and a bell that only exists on `/app` is a bell you only see
 * if you happen to be standing on the dashboard when it fills.
 *
 * So the row is the same everywhere and only the title changes: the dashboard
 * greets you by name, every other section names itself. Nothing else about a
 * screen's header moves — a page that had a subtitle keeps it, a page that had
 * a control beside the title passes it as `actions`.
 *
 * ## Sides, not left and right
 *
 * `justify-between` on a `text-start` column, so the title takes the reading
 * edge and the date and bell take the far one — right in English, left in
 * Arabic — without either side branching on the locale.
 *
 * ## Where the attention list comes from
 *
 * Either handed in or read here. The dashboard already loads it as part of its
 * single round of parallel queries and passes it down; every other page has no
 * reason to know the notifications feed exists, so it passes `clinicId` and the
 * header does the read itself.
 */
export type PageHeaderProps = {
  locale: Locale;
  /** The screen's name — or, on the dashboard, its greeting. */
  title: ReactNode;
  /** The line under the title, for pages that already had one. */
  subtitle?: ReactNode;
  /** Controls that belong in this row, placed before the date. */
  actions?: ReactNode;
  /**
   * Pre-loaded attention notifications. Pass these when the page already reads
   * them; otherwise pass {@link PageHeaderProps.clinicId} and let the header read.
   */
  attention?: StaffAttentionNotification[];
  /** The clinic to read attention for, when `attention` is not supplied. */
  clinicId?: string;
  /** Clinic-local `YYYY-MM-DD`; defaults to the server's own today. */
  today?: string;
  className?: string;
};

export async function PageHeader({
  locale,
  title,
  subtitle,
  actions,
  attention,
  clinicId,
  today,
  className,
}: PageHeaderProps) {
  const notifications = attention ?? (clinicId ? await loadStaffAttention(clinicId) : []);
  const date = today ?? toIsoDate(new Date());

  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2 text-start',
        className,
      )}
    >
      <div className="min-w-0">
        {/*
          24px at regular weight, not semibold.

          A page title is the name of the room, not an announcement: it is the
          largest thing on the screen already, and size alone is enough to place
          it. At 600 it competed with the toolbar under it and, in Arabic — where
          the UI face has no true bold and the browser synthesises one — it
          thickened the letterforms rather than darkening them. `tracking-tight`
          went with it: negative letter-spacing on Arabic works against the
          cursive join, and a lighter weight had no need of it.
        */}
        <h1 className="font-heading text-heading-lg font-normal" dir="auto">
          {title}
        </h1>
        {subtitle ? <p className="text-body-sm text-muted-foreground">{subtitle}</p> : null}
      </div>

      {/*
        The date, and the bell beside it. `body-md` (16px) rather than the 12px
        caption: with no app bar above it this line is the top of the page, and
        today's date is a fact you read at a glance rather than fine print under
        something else.
      */}
      <div className="flex items-center gap-2">
        {actions}
        <p className="text-body-md text-muted-foreground">{formatLongDate(locale, date)}</p>
        <NotificationsBell attention={notifications} />
      </div>
    </div>
  );
}
