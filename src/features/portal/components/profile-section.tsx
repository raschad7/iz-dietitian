import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';

/**
 * One section of the client's record: a heading over a ruled list of facts.
 *
 * It used to take a `note` — a sunken `SectionNote` strip closing the section —
 * and both are gone with the last caller. Each one explained a constraint the
 * screen already demonstrated: the health record's said "the more complete your
 * record, the more precise your plan" on a screen where the client can edit
 * nothing, and the contact screen's said changes go through the clinic, above
 * the request button that is the only way to make one.
 *
 * The clinic section deliberately does **not** use this — it draws each fact as
 * its own card rather than as a row in one. See the note at the top of
 * `clinic-section.tsx` for why that is a different composition rather than a
 * fifth layout mode here.
 *
 * **The heading sits on the page, above the card — not inside it.** It was in
 * the card, over the facts it names, which made the card the whole section and
 * the heading a line of text that happened to come first inside it. Out on the
 * page it labels the card the way `ClinicSection`'s heading already labels the
 * cards under it, so the two sections of this screen are built the same way
 * instead of two ways.
 *
 * **And it carries no glyph.** There was a bare line icon beside it — already
 * demoted once from a filled olive disc, because three stacked sections put
 * three chips down the screen. The demotion was the right direction and this is
 * the end of it: the heading is two or three words naming the card directly
 * beneath it, and a picture of a heart next to the words "my health record"
 * repeats the words.
 */
export function ProfileSection({
  title,
  lead,
  children,
}: {
  title: string;
  /**
   * Content between the heading and the list — the clinic section's
   * practitioner tile, or the health section's grid of headline figures.
   * Outside the `<dl>` because neither is a label/value pair.
   */
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-base leading-snug font-semibold">{title}</h2>

      <Card>
        <CardContent className="space-y-4">
          {lead}

          {/*
            The rows sit in their own bordered box rather than under a single
            rule. A section is now two kinds of thing — the tiles or the
            practitioner above, and the labelled facts below — and a bare
            divider between them left the facts looking like the tail of
            whatever came first. A panel fences them as one list. Plain radius,
            hairline, no shadow: it is a panel inside a card, not a second card
            (§Cards).
          */}
          {children ? (
            <dl className="divide-y divide-border rounded-lg border border-border px-4">
              {children}
            </dl>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
