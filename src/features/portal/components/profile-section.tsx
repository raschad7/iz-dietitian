import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';

/**
 * One section of the client's record: a heading, a ruled list of facts, and
 * optionally a footnote and a row of controls.
 *
 * **The heading glyph sits bare, not on a filled disc.** It was a 36px olive
 * chip, and on a screen that is three of these stacked, three olive chips were
 * the first thing the eye landed on — three times, at the top of three things
 * you are meant to read rather than act on. The glyph still marks the section;
 * it just stops shouting. It is a line icon for the same reason (see the note
 * beside these in `scripts/generate-icons.ts`).
 *
 * **The rule under the heading is the section's own edge.** Everything below it
 * is a `<dl>` of label/value pairs divided by hairlines, so the heading reads as
 * belonging to the list rather than floating above it.
 */
export function ProfileSection({
  icon,
  title,
  description,
  lead,
  children,
  note,
  action,
}: {
  icon: IconName;
  title: string;
  description?: string;
  /**
   * Content between the heading and the list — the clinic section's
   * practitioner tile, or the health section's grid of headline figures.
   * Outside the `<dl>` because neither is a label/value pair.
   */
  lead?: ReactNode;
  children?: ReactNode;
  /** A footnote under the list — the identifier caveat, for instance. */
  note?: ReactNode;
  /** Controls that close the section, below everything else. */
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2.5">
          <Icon name={icon} className="mt-0.5 size-5 shrink-0 text-primary" />

          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-base leading-snug font-semibold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>

        {lead}

        {/*
          The rows sit in their own bordered box rather than under a single rule.
          A section is now two kinds of thing — the tiles or the practitioner
          above, and the labelled facts below — and a bare divider between them
          left the facts looking like the tail of whatever came first. A panel
          fences them as one list. Plain radius, hairline, no shadow: it is a
          panel inside a card, not a second card (§Cards).
        */}
        {children ? (
          <dl className="divide-y divide-border rounded-lg border border-border px-4">{children}</dl>
        ) : null}

        {note}

        {action}
      </CardContent>
    </Card>
  );
}

/**
 * The muted caveat that closes a section — the mock's info-marked strip.
 *
 * A sunken block rather than a loose paragraph, because it is a note *about* the
 * list above it and needs to read as attached to it. The glyph is `infoOutline`
 * and not `attention`: nothing here has gone wrong, and amber (§Status) would
 * say a correction is owed.
 */
export function SectionNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-muted px-4 py-3">
      <Icon name="infoOutline" className="mt-0.5 size-4.5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
