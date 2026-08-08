import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Link tabs — the "link tabs" listed under *Not built yet* in
 * docs/design-system.md.
 *
 * **These are navigation, not a view toggle.** `Segmented` is the control for
 * choosing between views of the same page; when each option is an *address*,
 * a boxed control is the wrong promise. The client record was rendering its
 * five routes through `Segmented` and paying for it twice: the tabs shipped a
 * client component whose only job was `router.push`, so middle-click,
 * open-in-new-tab, Cmd-click and keyboard activation all did nothing a link
 * would have done for free — and because `Segmented` is `inline-flex`, a
 * `flex-col` parent stretched it to the full page width and left five tabs
 * hugging one edge of an otherwise empty bordered box.
 *
 * This ships no JavaScript. It is a `<nav>` of real links, so the active state
 * is whatever the current route says it is.
 *
 * ## Composition
 *
 * `tabLinkVariants` is exported rather than a `TabLink` component, and this
 * file imports nothing from `@/i18n/navigation`, because `components/ui` is the
 * shared layer and must not depend on routing. Call sites pair it with their
 * own `Link` exactly the way they already pair `buttonVariants` with one:
 *
 * ```tsx
 * <Tabs label={t('tabs.label')}>
 *   <Link href={href} aria-current={active ? 'page' : undefined}
 *         className={tabLinkVariants({ active })}>
 *     <Icon name="profile" className="size-[17px]" />
 *     {label}
 *   </Link>
 * </Tabs>
 * ```
 */
function Tabs({ label, className, ...props }: React.ComponentProps<'nav'> & { label: string }) {
  return (
    <nav
      aria-label={label}
      data-slot="tabs"
      className={cn(
        /*
         * `overflow-x-auto` and not a wrap: five tabs on a phone are a strip you
         * scroll, and a tab bar that reflows onto two lines stops reading as one
         * row of peers. `-mb-px` pulls the row onto the container's own hairline
         * so the active underline replaces that line rather than sitting under a
         * second one.
         */
        'flex shrink-0 gap-0.5 overflow-x-auto border-b border-border',
        // Hides the horizontal scrollbar's track on the platforms that draw one
        // permanently; the strip still scrolls by wheel, drag and keyboard.
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      {...props}
    />
  );
}

/**
 * One tab.
 *
 * **The active tab is olive-700 with an olive-500 underline.** The rail marks
 * its active row with olive-500 on olive-50, which docs/design-system.md
 * already flags as the system's one navigation contrast failure at 2.95:1.
 * There is no reason to repeat it here: olive-700 on the page's white is
 * 7.37:1, and the underline — a graphical mark, which needs only 3:1 — is what
 * carries the brand colour.
 *
 * Geometry does not change between states. Only the label colour and the
 * underline move, so a tab never shifts the row while you are reading it.
 */
const tabLinkVariants = cva(
  [
    'inline-flex shrink-0 items-center gap-2 whitespace-nowrap',
    /*
     * Square, deliberately. The 2px underline *is* the active mark, and a
     * radius on only the block-start corners would single one side out — which
     * the shape rules in docs/design-system.md forbid outright. A tab's
     * block-end edge is the container's own hairline rather than a free corner,
     * so there is nothing here for a radius to round.
     */
    'px-4 pt-3 pb-3.5 -mb-px border-b-2',
    'text-body-sm font-medium no-underline',
    'transition-colors duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo',
  ],
  {
    variants: {
      active: {
        true: 'border-b-primary text-secondary-foreground font-semibold',
        // The hover fill stops at the label rather than reaching the hairline,
        // which is why it is the sunken neutral and not a brand tint: a tint
        // here would read as a second active state.
        false: 'border-b-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      },
    },
    defaultVariants: { active: false },
  },
);

/**
 * A count on a tab — how many fields are still empty, how many plans exist.
 *
 * **A bare numeral, not a pill.** It was a filled chip, which is the shape this
 * system gives a *status* — and a count of empty fields is not a status, it is
 * a quantity. A record carrying a chip on one tab, a status chip in its header
 * and three more down the page reads as decorated rather than as informative,
 * and the chips stop meaning anything precisely because every one of them is
 * one. The digit alone carries the whole message at a third of the ink.
 *
 * It still inherits the tab's active state, so the count never looks like it
 * belongs to a different tab than its label.
 */
function TabBadge({
  active,
  className,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof tabLinkVariants>) {
  return (
    <span
      data-slot="tab-badge"
      className={cn(
        'text-label font-semibold tabular-nums',
        active ? 'text-secondary-foreground' : 'text-muted-foreground/80',
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabBadge, tabLinkVariants };
