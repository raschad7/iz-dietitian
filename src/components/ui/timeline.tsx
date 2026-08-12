import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A vertical timeline: a rail of marks, and what happened beside each one.
 *
 * For a sequence where the *order* is the content — a client's visits, an audit
 * trail. It is not a list with a decoration down the side: the rail is what says
 * these entries are one continuous run, and the gap between two marks is what
 * says the run has a shape. Where the entries are independent of each other, a
 * ruled list is the honest control and this one overstates.
 *
 * ## Composition
 *
 * ```tsx
 * <Timeline>
 *   {visits.map((visit, index) => (
 *     <TimelineItem
 *       key={visit.id}
 *       connected={index < visits.length - 1}
 *       marker={<TimelineDot tone={visit.isNext ? 'current' : 'done'} />}
 *     >
 *       …
 *     </TimelineItem>
 *   ))}
 * </Timeline>
 * ```
 *
 * `connected` rather than a `last` flag read from inside: the component cannot
 * see its siblings, and a rail that runs past the final mark into empty space is
 * the one thing that makes a timeline look broken. The caller already has the
 * index.
 *
 * ## Direction
 *
 * The rail is a *grid column*, not an absolutely positioned line, so it sits at
 * the inline-start edge in both scripts with no mirrored rule and nothing to
 * flip — grid tracks follow the writing direction for free. There is no
 * `start-4`/`left-4` anywhere here, which is what the absolutely positioned
 * version this replaces would have needed twice over.
 *
 * The block axis does not mirror, so the line's own geometry is direction-free.
 */
function Timeline({ className, ...props }: React.ComponentProps<'ol'>) {
  return <ol data-slot="timeline" className={cn('flex flex-col', className)} {...props} />;
}

/**
 * One entry: the mark, the line under it, and the content beside both.
 *
 * The rail column is a flex column whose line takes `flex-1`, so it stretches to
 * whatever the content beside it turns out to be tall — an entry with a note
 * under it draws a longer line than a bare one, with nothing measured and no
 * height passed in.
 *
 * The block-end padding is on the *content*, not on the `li`: padding on the row
 * would sit below the rail and break the line between two entries.
 */
function TimelineItem({
  marker,
  connected = true,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'li'>, 'children'> & {
  /** The mark on the rail — normally a {@link TimelineDot}. */
  marker: React.ReactNode;
  /** Draws the line on to the next entry. `false` on the last one. */
  connected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      data-slot="timeline-item"
      className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-3', className)}
      {...props}
    >
      <div className="flex flex-col items-center gap-1.5">
        {marker}
        {/*
          `w-px` and the hairline token, so the rail is the same weight as every
          other rule on the page. It is `aria-hidden` by being a bare span with
          no text — a screen reader reads the entries, and the line between them
          is not one of them.
        */}
        {connected ? <span className="w-px flex-1 bg-border" /> : null}
      </div>

      <div className={cn('min-w-0', connected && 'pb-5')}>{children}</div>
    </li>
  );
}

/**
 * The mark on the rail.
 *
 * Two tones, and the split is the information: `current` is what the reader came
 * to find — the next thing, or today — and `done` is everything already behind
 * them. A rail of identical marks spends a colour on saying "this is a
 * timeline", which the rail already said.
 *
 * `current` is a ring around a filled core rather than a larger disc: size on
 * one entry in a column makes the rail itself look crooked, where a ring reads
 * as emphasis without moving the line the marks are threaded on.
 */
function TimelineDot({
  tone = 'done',
  className,
  ...props
}: React.ComponentProps<'span'> & { tone?: 'current' | 'done' }) {
  return (
    <span
      data-slot="timeline-dot"
      aria-hidden
      className={cn(
        'flex size-3.5 shrink-0 items-center justify-center rounded-full',
        tone === 'current' ? 'bg-primary-subtle' : 'bg-muted',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'current' ? 'bg-primary' : 'bg-muted-foreground/50',
        )}
      />
    </span>
  );
}

/**
 * The entry's own head: what it was, and when, on one row.
 *
 * `items-baseline` rather than centred — the two sides are set at different
 * sizes, and centring them leaves the smaller one floating against the larger.
 * The timestamp is `text-end` and `shrink-0`, so a long label truncates rather
 * than pushing the time out of the row.
 */
function TimelineHeading({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timeline-heading"
      className={cn('flex items-baseline justify-between gap-3', className)}
      {...props}
    />
  );
}

/** Whatever hangs under the heading — a note, a chip, a detail line. */
function TimelineContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timeline-content"
      className={cn('mt-1 flex flex-col gap-1.5', className)}
      {...props}
    />
  );
}

export { Timeline, TimelineItem, TimelineDot, TimelineHeading, TimelineContent };
