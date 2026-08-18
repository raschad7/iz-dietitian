'use client';

import * as React from 'react';
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

import { cn } from '@/lib/utils';

/**
 * Panel tabs — one page, several views of it, switched in place.
 *
 * **This is not `Tabs` from `./tabs.tsx`.** That file is a `<nav>` of real
 * links, for a record whose sections are *addresses*; this is the ARIA tablist
 * pattern, for a panel whose sections are views of the page you are already on.
 * The two look different on purpose, which is the whole reason both exist: a
 * link tab underlines, because it is a place you are about to go, and a panel
 * tab sits in a track, because it is a switch. See `Segmented` for the third
 * member of that family — the two-to-four-option control that does the same job
 * when the options are short enough to sit on one line and there is no panel to
 * label.
 *
 * ## Where the shape came from
 *
 * The shadcn admin template's `users/view` tab bar, which is what the client
 * profile was asked to adopt: a sunken track with the selected tab lifted out of
 * it as a card. It is ported onto this system's tokens rather than copied —
 * `bg-muted` for the track, `bg-card` plus `shadow-card` for the selected tab,
 * green-700 for its label — so the control belongs to the same palette as the
 * cards under it.
 *
 * ⚠ **The selected tab is not a solid olive fill.** Olive marks what you can act
 * on (docs/design-system.md, "Colour"), and a tab bar merely says which view you
 * are in — the same argument the visit record's `Segmented` records for its own
 * neutral thumb. The label carries green-700 at 7.37:1 on the raised white; the
 * fill stays neutral.
 *
 * ## Base UI, not a hand-rolled tablist
 *
 * `roving focus`, `aria-controls` wiring, arrow-key navigation and the
 * `Home`/`End` keys all come from the primitive, and it reads direction from the
 * `DirectionProvider` the app layout already mounts — so the arrow keys run the
 * correct way in Arabic with nothing passed here.
 *
 * ```tsx
 * <PanelTabs defaultValue="account">
 *   <PanelTabsList label={t('label')}>
 *     <PanelTabsTrigger value="account">{t('account')}</PanelTabsTrigger>
 *     <PanelTabsTrigger value="security">{t('security')}</PanelTabsTrigger>
 *   </PanelTabsList>
 *
 *   <PanelTabsPanel value="account">{account}</PanelTabsPanel>
 *   <PanelTabsPanel value="security">{security}</PanelTabsPanel>
 * </PanelTabs>
 * ```
 */
function PanelTabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="panel-tabs"
      className={cn('flex min-h-0 flex-col gap-3', className)}
      {...props}
    />
  );
}

/**
 * The track.
 *
 * **It fits the column it is in, and it does not scroll it.** From `md` up the
 * track is exactly the width of its container and the tabs share that width
 * between them — `flex-auto`, so they keep their *relative* widths and a long
 * label still reads as the longer one, rather than `flex-1`, which would give a
 * three-letter tab the same box as a two-word one. A bar that runs off the edge
 * makes its last view a thing you have to know is there.
 *
 * Below `md` it is `w-max` inside a scroller, which is the honest answer once the
 * column is genuinely too narrow: four tabs squeezed into a phone would be four
 * ellipses, and a strip you push is more use than a row you cannot read.
 * `min-w-full` keeps a short tab set spanning its column rather than hugging one
 * edge.
 */
function PanelTabsList({
  label,
  className,
  ...props
}: TabsPrimitive.List.Props & { label: string }) {
  return (
    <div
      className={cn(
        'shrink-0 overflow-x-auto md:overflow-visible',
        // Hides the scrollbar track on the platforms that draw one permanently;
        // the strip still scrolls by wheel, drag and keyboard.
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      <TabsPrimitive.List
        aria-label={label}
        data-slot="panel-tabs-list"
        className={cn(
          'inline-flex h-11 w-max min-w-full items-center gap-0.5 rounded-lg bg-muted p-1 md:flex md:w-full',
          className,
        )}
        {...props}
      />
    </div>
  );
}

/**
 * One tab.
 *
 * Geometry holds still between states — only the fill, the shadow and the label
 * colour move — so switching a tab never shifts the row a reader is looking at.
 * The unselected tabs answer the pointer with the ambient tint rather than with
 * the raised card, which would be a second selected state.
 *
 * `truncate` is the last resort, not the plan: with `flex-auto` on the track
 * above, the tabs only start clipping once the column is genuinely too narrow
 * for their labels, and an ellipsis on the two longest is a better failure than
 * a bar that overflows its own card.
 */
function PanelTabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="panel-tabs-trigger"
      className={cn(
        'inline-flex h-full min-w-0 flex-auto items-center justify-center gap-1.5 truncate rounded-md px-2.5 whitespace-nowrap',
        'text-body-sm font-medium text-muted-foreground',
        'transition-[color,background-color,box-shadow] duration-(--duration-label) ease-(--ease-sweep)',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-focus-halo',
        'hover:bg-accent/60 hover:text-foreground',
        'data-active:bg-card data-active:font-semibold data-active:text-secondary-foreground data-active:shadow-card data-active:hover:bg-card',
        "[&_svg]:size-[1.0625rem] [&_svg]:shrink-0 [&_svg]:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * One view.
 *
 * Unmounted while hidden, which is the primitive's default and the right one
 * here: every panel of the client profile is a server-rendered subtree handed
 * in as a child, and keeping five of them in the DOM would mean five copies of a
 * record on screen at once for the benefit of nobody.
 */
function PanelTabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="panel-tabs-panel"
      className={cn('min-h-0 flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { PanelTabs, PanelTabsList, PanelTabsTrigger, PanelTabsPanel };
