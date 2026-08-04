import { ChevronRight, type LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';

/**
 * A one-line preview of somewhere else: an icon tile, what it is, and the way in.
 *
 * The portal home screen is a glance, not a dashboard — the plan and the next
 * appointment each get a row here and their real screen one tap away. Before
 * this, home reproduced the whole of today's meal list and the full appointment
 * card, which made it the second copy of two pages that already existed.
 *
 * Shared by the two rows on that screen so they cannot drift into looking like
 * different kinds of object. It lives in the portal feature rather than in
 * `src/components/ui/`: nothing in the practitioner app has this shape, and a
 * shared component with one consumer is a guess about the future.
 */
export function PreviewCard({
  href,
  icon: Icon,
  title,
  lines,
  action,
}: {
  href: '/portal/meal-plan' | '/portal/appointments' | '/portal/appointments/request';
  icon: LucideIcon;
  title: string;
  /**
   * One or two supporting lines. `emphasis` marks the one that carries the
   * fact; `ltr` is for strings whose parts must keep their own order inside an
   * RTL paragraph — a time range being the case this was added for.
   */
  lines: { text: string; emphasis?: boolean; ltr?: boolean }[];
  action: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary"
        >
          <Icon className="size-5.5" strokeWidth={1.7} />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-heading text-sm leading-snug font-medium">{title}</h2>

          {lines.map((line) => (
            <p
              key={line.text}
              className={
                line.emphasis
                  ? 'truncate text-xs font-medium text-secondary-foreground'
                  : 'truncate text-xs text-muted-foreground'
              }
            >
              {/*
                `<bdi dir="ltr">` rather than `dir` on the paragraph: putting
                the direction on the block would right-align the line's box in
                Arabic as well as reorder it, and "10:30 – 11:00" needs its
                parts kept in order while the line itself stays where the
                column puts it. An inline isolate does exactly that.
              */}
              {line.ltr ? <bdi dir="ltr">{line.text}</bdi> : line.text}
            </p>
          ))}
        </div>

        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-status-on-track-bg"
        >
          {action}
          {/* Directional: it points the way the reader travels, so it mirrors. */}
          <ChevronRight className="size-3.5 opacity-70 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
