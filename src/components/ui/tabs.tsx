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
function Tabs({
  label,
  appearance = 'line',
  className,
  ...props
}: React.ComponentProps<'nav'> & { label: string; appearance?: 'line' | 'contained' }) {
  return (
    <nav
      aria-label={label}
      data-slot="tabs"
      data-appearance={appearance}
      className={cn(
        /*
         * `overflow-x-auto` and not a wrap: five tabs on a phone are a strip you
         * scroll, and a tab bar that reflows onto two lines stops reading as one
         * row of peers. `-mb-px` pulls the row onto the container's own hairline
         * so the active underline replaces that line rather than sitting under a
         * second one.
         */
        'flex shrink-0 overflow-x-auto',
        appearance === 'line'
          ? 'gap-0.5 border-b border-border'
          /*
           * The panel bar's own geometry, to the pixel — `h-11`, `rounded-lg`,
           * `bg-muted`, `p-1`, `gap-0.5`. `PanelTabsList` is the reference and
           * this is the link-flavoured twin of it; a settings tab bar and a
           * client-record tab bar that differ by two pixels of padding read as
           * a mistake rather than as two components.
           *
           * `w-full` rather than `w-fit`, so the track spans its column and the
           * tabs share it — a bar that hugs one edge of an otherwise empty row
           * is what the line appearance is for.
           */
          : 'h-11 w-full min-w-full items-center gap-0.5 rounded-lg bg-muted p-1',
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
 * **The active *line* tab is green-700 with an green-500 underline.** The rail
 * marks its active row with green-500 on green-50, which docs/design-system.md
 * already flags as the system's one navigation contrast failure at 2.95:1.
 * There is no reason to repeat it here: green-700 on the page's white is
 * 7.37:1, and the underline — a graphical mark, which needs only 3:1 — is what
 * carries the brand colour.
 *
 * **The active *contained* tab is plain `text-foreground`.** That tab is a
 * raised card on a sunken track: fill, shadow and weight have all already said
 * "this one" before colour gets a turn. Tinting the label as well only makes it
 * the quietest green on the page, and under a black page heading it read as a
 * link rather than as where you are.
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
    'text-body-sm font-medium no-underline',
    'transition-colors duration-(--duration-label) ease-(--ease-sweep)',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo',
  ],
  {
    variants: {
      active: {
        /*
         * No colour here. The two appearances mark "active" differently — the
         * line tab has only the label and its underline to work with, the
         * contained tab has a raised card — so the colour is set in the
         * compound variants below and nowhere else.
         *
         * ⚠ It used to be `text-secondary-foreground` on this variant, with the
         * contained pair trying to override it to `text-foreground`. `cva`
         * concatenates classes, so both landed on the element at equal
         * specificity and the winner was decided by stylesheet order, not by
         * which one was written last. The override lost, silently.
         */
        true: 'font-semibold',
        // The hover fill stops at the label rather than reaching the hairline,
        // which is why it is the sunken neutral and not a brand tint: a tint
        // here would read as a second active state.
        false: 'text-muted-foreground hover:text-foreground',
      },
      appearance: {
        line: [
          'relative -mb-px border-b-2 border-b-transparent px-4 pt-3 pb-3.5',
          'after:pointer-events-none after:absolute after:inset-x-4 after:bottom-[-1px] after:h-0.5 after:origin-center after:scale-x-0 after:bg-primary after:transition-transform after:duration-(--duration-label) after:ease-(--ease-sweep)',
        ],
        /*
         * `PanelTabsTrigger`'s treatment, borrowed wholesale. `flex-auto` and
         * not `flex-1`: the tabs keep their *relative* widths, so a two-word
         * label still reads as the longer one instead of every tab getting an
         * identical box.
         *
         * No border. The panel bar distinguishes the selected tab with fill and
         * shadow alone, and adding a hairline here put a line around one of
         * four otherwise identical shapes.
         */
        contained: [
          'h-full min-w-0 flex-auto justify-center rounded-md px-2.5',
          'hover:bg-accent/60',
        ],
      },
    },
    compoundVariants: [
      {
        appearance: 'line',
        active: true,
        // Olive on the label, olive underline — see this block's docstring for
        // why the line tab carries the brand colour and the contained one does
        // not.
        class: 'text-secondary-foreground after:scale-x-100',
      },
      {
        appearance: 'contained',
        active: true,
        /*
         * `text-foreground`, not the olive the line tabs use. The selected tab
         * here is already a raised card on a sunken track — fill, shadow and
         * weight all say "this one" before colour gets a chance to. Adding the
         * brand tint on top of three other signals only makes the label the
         * quietest kind of green, and the settings bar sits directly under a
         * page heading in plain black; a green heading-sized label under it read
         * as a link rather than as where you are.
         *
         * `hover:bg-card` holds the raised fill under the pointer: the
         * unselected hover tint firing on the selected tab would read as it
         * being deselected.
         */
        class: 'bg-card font-semibold text-foreground shadow-card hover:bg-card',
      },
    ],
    defaultVariants: { active: false, appearance: 'line' },
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
