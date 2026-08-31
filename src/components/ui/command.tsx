'use client';

import { Command as CommandPrimitive } from 'cmdk';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The command list — a filtered, keyboard-driven menu.
 *
 * shadcn's `command`, in the repository's own tokens. `cmdk` supplies the parts
 * that are genuinely hard: the roving highlight, the type-ahead scoring, the
 * `aria-activedescendant` wiring that lets one input drive a listbox it does
 * not contain. Everything visual is this file's.
 *
 * ## What was changed from the registry file
 *
 * - **No `CommandDialog`.** The registry's version wraps a `Dialog` with a
 *   `DialogContent`/`DialogTitle` anatomy this repository does not have — the
 *   local `Dialog` is a native `<dialog>` taking `open`, `onClose` and `label`.
 *   Composing the two is the caller's job; see `CommandPalette`.
 * - **No `InputGroup` around the input, and no icon inside it.** The registry
 *   file imports a glyph directly. Icons here come from the `Icon` registry by
 *   app name (`src/lib/icons.ts`), so the caller draws it and this file stays
 *   free of any one icon set.
 * - **Logical properties.** `ms-auto`, not `ml-auto`: the shortcut hint and the
 *   trailing meta sit at the *end* of a row, which is the left in Arabic.
 * - **Repository tokens** throughout — `bg-popover`, `bg-muted`,
 *   `text-muted-foreground` — rather than the registry's `input/30` washes.
 *
 * `cmdk` does its own filtering with a fuzzy scorer. Anything already filtered
 * elsewhere — a server search, say — must be handed to `Command` with
 * `shouldFilter={false}`, or rows the server matched will be scored again by a
 * client that never saw the query the server actually ran.
 */
function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex size-full flex-col overflow-hidden bg-popover text-popover-foreground',
        className,
      )}
      {...props}
    />
  );
}

/**
 * The query field.
 *
 * `cmdk` renders a real `<input>` and owns its `aria-*` relationship with the
 * list below. The visible chrome — the border, the glyph, the shortcut hint —
 * belongs to whatever row the caller builds around it.
 */
function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <CommandPrimitive.Input
      data-slot="command-input"
      className={cn(
        'w-full min-w-0 bg-transparent text-body-md text-foreground outline-hidden',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('scroll-py-1 overflow-x-hidden overflow-y-auto outline-none', className)}
      {...props}
    />
  );
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn('py-8 text-center text-body-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * A titled band of rows.
 *
 * The heading is styled through `[cmdk-group-heading]` rather than a slot of
 * our own, because `cmdk` renders it itself and hides the whole group — heading
 * included — when every row inside has been filtered out. A heading we rendered
 * would survive its own rows.
 *
 * Not `uppercase` and not `tracking-wider`, for the reason `NavSectionLabel` in
 * the rail gives: Arabic has no uppercase, and letter-spacing breaks the
 * cursive joins that make an Arabic word legible.
 */
function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-1 text-foreground',
        '**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5',
        '**:[[cmdk-group-heading]]:text-caption **:[[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  );
}

/**
 * One row.
 *
 * `data-selected` is the highlight — set by `cmdk` on the row the keyboard is
 * on, and on hover. It is deliberately the same `bg-accent` the rail's own
 * selected row wears: the two lists are read the same way and should not
 * disagree about what "this one" looks like.
 */
function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        'group/command-item relative flex cursor-default select-none items-center gap-3 rounded-md px-2 py-2',
        'text-body-sm text-foreground outline-hidden',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        'data-selected:bg-accent data-selected:text-accent-foreground',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The trailing hint on a row — a keyboard shortcut, a phone number, a date.
 *
 * `ms-auto` pushes it to the row's end, which is the left in Arabic and the
 * right in English from the one declaration.
 */
function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        'ms-auto text-caption text-muted-foreground tabular-nums',
        'group-data-selected/command-item:text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
