'use client';

import { type ReactNode } from 'react';

import { cardVariants } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A card that is also a disclosure: a header row you press to open the rest.
 *
 * **This is what turns a long record into a spine.** A screen holding forty
 * label/value pairs of very different importance — a blood type and a drug
 * allergy at the same weight, on cards that appear and disappear depending on
 * what happens to be filled in — is not read, it is searched. Every section
 * being one identical row means the list of rows *is* the table of contents:
 * the same headings in the same order for every client, each one saying how
 * much is behind it, and only the ones worth reading first open on arrival.
 *
 * ## Why the header is stable
 *
 * The summary does not disappear when the panel opens, and the row does not
 * change size. A header that reflows as you press it moves the next row out
 * from under the pointer, which on a stack of six is how you end up opening two
 * — and the design system's rule is that geometry holds still through a state
 * change (docs/design-system.md, "Shape, spacing, elevation and motion"). Only
 * the chevron turns.
 *
 * ## Server-rendered children
 *
 * The shell is a Client Component and its contents are not: `children` arrives
 * already built on the server, the same arrangement `ClientProfileTabs` uses for
 * its panels. Nothing about the record crosses the boundary as data, and adding
 * a disclosure to a section costs the browser a button rather than a screen.
 *
 * ## Find-in-page still works
 *
 * `hiddenUntilFound` on the panel, which is `hidden="until-found"` rather than
 * `display: none` — the browser searches the closed content and opens the
 * section it lands in. Without it, collapsing a clinical record would quietly
 * remove most of it from Ctrl+F, and a dietitian searching a patient's notes for
 * a drug name would get no result on a record that contains one.
 *
 * The `[&[hidden]:not([hidden='until-found'])]:hidden` in the panel's classes is
 * what keeps that working under Tailwind's preflight, which would otherwise
 * apply `display: none` to *any* `[hidden]` and defeat the point. Same recipe as
 * the rail's account panel — see `sidebar-profile.tsx`.
 */
export function Disclosure({
  icon,
  title,
  summary,
  defaultOpen = false,
  children,
  className,
}: {
  icon: IconName;
  /** The section's name. Rendered inside an `h3`, so it is a real heading. */
  title: string;
  /**
   * What is behind the row, in a few words, shown open or closed. Optional, and
   * **a filled row is almost always better without it.**
   *
   * ⚠ The client record has been through three versions of this and removed all
   * of them. A tally of recorded answers on every section, on the theory that a
   * closed row should say whether it is worth opening — a count never answered
   * that, and six rows each ending in a different numeral turned a clean spine
   * into a column of arithmetic. Then a couple of rows kept a summary that was
   * genuinely useful in itself: the allergens in clay, a meal schedule's calorie
   * total. Those went too, and for a better reason than the counts did — **one
   * row breaking the pattern is the row a reader stops trusting the pattern
   * over.** A spine is worth more than any single line on it.
   *
   * What is left is the case a title cannot cover: "not recorded yet". Without
   * it an empty section and a full one are the same row, and the reader opens it
   * to find out. If a filled row seems to need a summary, check first whether it
   * should simply be `defaultOpen`.
   */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      render={
        <section
          className={cn(
            /*
             * The card's own surface — ring, shadow, radius, `--card-spacing` —
             * taken from `cardVariants` rather than restated, so this stays one
             * definition of what a card looks like.
             *
             * `gap-0 py-0` overrides the flex flow it comes with: the trigger
             * and the panel own their padding here, because a `gap` between
             * them would still be spending block space at the end of the close
             * animation, when the panel has reached zero height but has not yet
             * stopped being a flex item.
             */
            cardVariants({ variant: 'default' }),
            'gap-0 py-0',
            className,
          )}
        />
      }
    >
      {/*
        The heading wraps the button rather than sitting inside it: `button`
        takes phrasing content, and an `h3` is not phrasing content. This is the
        shape an accordion header has to have for the heading to be a heading a
        screen reader can jump between.
      */}
      <h3 className="flex">
        <CollapsibleTrigger className="group/disclosure flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg px-(--card-spacing) py-4 text-start outline-none transition-colors duration-(--duration-label) ease-(--ease-sweep) hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none">
          <Icon
            name={icon}
            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/disclosure:text-primary"
          />

          <span className="min-w-0 flex-1 truncate font-heading text-body-md font-semibold">
            {title}
          </span>

          {/*
            Hidden below `sm`, where the title, the summary and the chevron on
            one 320px row would leave the title itself an ellipsis. The section
            still opens; the count is what a phone gives up, not the name.
          */}
          {summary ? (
            <span className="hidden min-w-0 shrink truncate text-body-sm text-muted-foreground sm:block">
              {summary}
            </span>
          ) : null}

          <Icon
            name="chevronDown"
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--duration-label) ease-(--ease-sweep) group-data-[panel-open]/disclosure:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
      </h3>

      <CollapsibleContent
        hiddenUntilFound
        className="h-(--collapsible-panel-height) overflow-hidden opacity-100 transition-[height,opacity] duration-(--duration-arc) ease-(--ease-sweep) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden"
      >
        {/*
          The padding is on an inner box, not on the panel. The panel is the
          element whose height animates, and padding on it would be height the
          transition has to travel through — so a closed section would keep
          `--card-spacing` of it and the row would never quite shut.
        */}
        <div className="px-(--card-spacing) pb-(--card-spacing)">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
