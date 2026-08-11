import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';

/**
 * The body of a settings sub-screen: prose, in blocks with headings.
 *
 * Privacy and help are the two places in this app where the client is being
 * read to rather than shown a control, so they get a reading measure and a
 * looser line height instead of the row rhythm every other settings surface
 * uses. `max-w-prose` caps the line length on a desktop; on a phone it never
 * binds.
 */
export function SettingsArticle({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="max-w-prose space-y-5 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

export function SettingsArticleBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="font-heading text-sm font-medium text-secondary-foreground">{title}</h2>
      <div className="space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}

/**
 * The other shape a settings sub-screen can take: one claim per card, each with
 * a glyph.
 *
 * `SettingsArticle` above is a document — four headings inside a single surface,
 * read top to bottom. This is a **list of separate promises**, and the privacy
 * screen is the one place that distinction matters: nobody reads a privacy page,
 * they arrive at it with one question ("can my dietitian see my weight?",
 * "who else gets this?") and want to find the one paragraph that answers it. A
 * card each gives every claim its own edge to be found by, and the glyph gives
 * it a mark to be found by *without reading* — which is the whole point on a
 * screen someone is scanning rather than studying.
 *
 * **Terms uses it too.** That screen is four statements about how the portal
 * behaves — what an account is, what the plan is and is not, how the clinic
 * reaches you, and that the page may change — and each is looked up rather than
 * read in sequence, which is the same condition privacy meets. Help and
 * security keep `SettingsArticle`: those genuinely are chapters, and four cards
 * there would be four boxes pretending to be independent.
 *
 * **The disc, the rule, then the claim.** The hairline between the glyph and
 * the text is what makes the mark read as a *marker* for the block rather than
 * as the first thing in it — without it, on a card whose title is already
 * olive, the disc and the heading ran together as one coloured lump at the
 * start of every card.
 *
 * The heading colour is `secondary-foreground` — olive-700, the palette's
 * `text.brand` at 7.37:1 — and not `text-primary`. Olive-500 is 3.47:1 and would
 * fail on a heading; this is also what the article's headings already use, so
 * the two shapes read as the same voice.
 */
export function SettingsPoint({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card size="sm">
      {/*
        `items-center`, so the glyph sits against the block rather than against
        its first line. These are two to four lines each — short enough that a
        centred mark reads as belonging to the whole claim. On anything longer it
        would float mid-paragraph and `items-start` would be right instead.
      */}
      <CardContent className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-icon-chip text-icon-chip-foreground"
        >
          <Icon name={icon} className="size-6" />
        </span>

        {/*
          `self-stretch` against the parent's `items-center`: the rule runs the
          height of whichever is taller, the disc or the claim, so a two-line
          card and a four-line one both read as the same component rather than
          as one with a longer line drawn down it.
        */}
        <span aria-hidden="true" className="w-px self-stretch bg-border" />

        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-heading text-base leading-snug font-semibold text-secondary-foreground">
            {title}
          </h2>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/*
 * `SettingsAssurance` used to live here — the sunken strip that closed the help
 * and privacy screens with one reassuring sentence ("لم تجد إجابة لسؤالك؟",
 * "خصوصيتك تهمنا"). Both are gone with their last callers.
 *
 * Each restated what the screen above it had already demonstrated: the help
 * page's repeated the contact panel directly above it, offering the same clinic
 * a second time in plainer words, and the privacy page's summarised four points
 * that were already four short sentences. A summary earns its place when the
 * thing above it is long; these screens are four cards you can read in full.
 */
