import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { buttonVariants } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

/**
 * The app's pager — `@shadcn/pagination`, plus the parts this app needs that
 * the registry item has no answer for.
 *
 * Same deal as `table.tsx`: the registry's structure, slot names and class
 * vocabulary unless one of these reasons applies. Re-running `shadcn add
 * pagination --overwrite` would undo all of them, so check this list first.
 *
 * 1. **`render`, not `asChild`.** The registry's `PaginationLink` is a bare
 *    `<a>`, which in a Next.js app means a full page load and, in this app,
 *    also means losing the locale prefix that `@/i18n/navigation`'s typed
 *    `Link` adds. This repo's composition escape hatch is Base UI's `useRender`
 *    (see `sidebar.tsx`), so a caller passes `render={<Link href={…} />}` and
 *    keeps client-side navigation and typed routes.
 * 2. **No `"use client"`.** Nothing here holds state or a handler — the pager is
 *    a row of links, and the register that draws it is a server component whose
 *    whole point is shipping no JavaScript.
 * 3. **Icons come from `@/components/ui/icon`, not `lucide-react` directly.**
 *    `chevronStart` / `chevronEnd` are in that set's `DIRECTIONAL` list, so they
 *    mirror themselves in Arabic; the registry's hardcoded `ChevronLeft` would
 *    point the wrong way on half this app's pages.
 * 4. **`buttonVariants` are this app's.** The registry reaches for `ghost` and
 *    `outline`; the equivalents here are `neutralGhost` and the round `icon-sm`,
 *    which is what makes the pager look like the rest of the toolbar.
 * 5. **Labels are required props, not hardcoded English.** The registry writes
 *    "Previous" and "Next" into the component. Every string in this app comes
 *    from the message catalogue, so they arrive as props.
 */
function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  /** Marks the page being read. Sets `aria-current`, as the registry's does. */
  isActive?: boolean
  size?: "icon-sm" | "icon" | "sm" | "default"
} & useRender.ComponentProps<"a"> &
  React.ComponentProps<"a">

/**
 * One page in the row.
 *
 * The active page is `secondary` — the brand's quiet olive fill — rather than
 * the solid `default`. A pager is a place marker, not the screen's action:
 * a filled olive button here would outrank "New client" in the toolbar above
 * it, and there is only ever one of those per screen.
 *
 * **No border on the active page, and the fill alone is a weak mark.**
 * `--secondary` is green-50, 1.07:1 against a white page — on a button that is
 * a tint you read as a surface, on a numeral it is nearly nothing. It is
 * enough where the current page is the *only* page drawn, which is how
 * `ClientPagination` now works: one numeral between two steps, and what tells
 * you the step landed is the digit changing, not the chip behind it. The
 * semibold numeral in `--foreground` (16.05:1 on that fill) is the rest of it.
 *
 * ⚠ It is thinner than it looks where a pager still draws a *row* of numbers —
 * `DishPagination` does — because there the reader has to pick the current one
 * out of five identical chips and a 1.07:1 fill is not much to do it with. An
 * edge would fix it: green-500 measures 3.47:1 on the page and 3.23:1 on the
 * chip, clearing the 3:1 a boundary needs from either side. Left undrawn on
 * purpose, not overlooked.
 */
function PaginationLink({
  className,
  isActive,
  size = "icon-sm",
  render,
  ...props
}: PaginationLinkProps) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-current": isActive ? "page" : undefined,
        className: cn(
          buttonVariants({ variant: isActive ? "secondary" : "neutralGhost", size }),
          // Page numbers are figures in a row that must not jitter as the
          // digits change under them — the same reason the table's number
          // columns carry it.
          "tabular",
          // After the variant, so `twMerge` resolves the label colour in this
          // file's favour rather than the variant's.
          isActive && "font-semibold text-foreground",
          className
        ),
      },
      props
    ),
    render,
    // `data-slot` / `data-active` go through `state` rather than the props
    // literal: Base UI's `mergeProps` types the literal as real anchor
    // attributes and rejects arbitrary `data-*`. Same route `sidebar.tsx` takes.
    state: { slot: "pagination-link", active: isActive ?? false },
  })
}

/**
 * Previous / Next. The glyph leads on the way back and trails on the way
 * forward, which is the shape of the control in both scripts once
 * `chevronStart` / `chevronEnd` have mirrored themselves.
 */
function PaginationPrevious({ className, label, ...props }: PaginationLinkProps & { label: string }) {
  return (
    <PaginationLink
      size="sm"
      aria-label={label}
      className={cn("gap-1 px-3", className)}
      {...props}
    >
      <Icon name="chevronStart" />
      {/* The words go on `sm` and up: at phone width five page numbers and two
          labelled steps do not fit, and the glyph alone is the affordance
          everyone already knows. The accessible name stays either way. */}
      <span className="hidden sm:block">{label}</span>
    </PaginationLink>
  )
}

function PaginationNext({ className, label, ...props }: PaginationLinkProps & { label: string }) {
  return (
    <PaginationLink
      size="sm"
      aria-label={label}
      className={cn("gap-1 px-3", className)}
      {...props}
    >
      <span className="hidden sm:block">{label}</span>
      <Icon name="chevronEnd" />
    </PaginationLink>
  )
}

/**
 * The `…` standing in for pages that are not drawn.
 *
 * `aria-hidden`, because the pages it stands for are not reachable from here —
 * there is nothing for a screen reader to do with it, and "ellipsis" announced
 * between two page numbers is noise. The registry keeps a visually hidden
 * "More pages" here; this app drops it for the same reason it drops the em dash
 * in an empty table cell.
 */
function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-10 items-center justify-center text-muted-foreground", className)}
      {...props}
    >
      <Icon name="moreActions" className="size-4" />
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
