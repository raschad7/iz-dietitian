"use client"

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Icon } from "@/components/ui/icon"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
/*
  56px, not the registry's 48px. The rail's glyphs are 20px rather than 16px —
  they are what you navigate by once the labels are gone — and a 40px hit target
  around one of those needs 8px of group padding on either side to breathe.
*/
const SIDEBAR_WIDTH_ICON = "3.5rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
  /**
   * The rail is locked to icons and cannot be opened at this width.
   *
   * True on a `railOnly` shell below `lg`. It is what the trigger reads to take
   * itself out of the page — a control that cannot do anything is worse than no
   * control — and what `Sidebar` reads to draw the rail instead of the drawer.
   */
  locked: boolean
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

/**
 * @param railOnly Lock the rail to its icon width on a **phone**, with no drawer
 *   and no way to open it.
 *
 *   Navigation is always on screen there as a column of icons, replacing a
 *   `<dialog>` drawer that had to be opened before any destination could be
 *   reached and then covered the page while it was.
 *
 *   ⚠ **The tablet is deliberately not locked.** This was briefly keyed on
 *   `isCompact` (`width < 64rem`), which took 768–1023px with it: an iPad got
 *   the icon rail with the trigger removed, and the expanded 16rem column —
 *   with the destination labels on it — was unreachable on the device most of
 *   the day's work happens on. From `md` up the rail is collapsible again and
 *   `SidebarTrigger` is back in its head, so the tablet opens and closes it
 *   exactly as the desktop does. The stored preference drives both.
 *
 *   Opt-in rather than the default, because the other shell that renders this is
 *   the patient portal — a phone-first app with a bottom tab bar carrying the
 *   same five destinations. A permanent icon rail there would be a second
 *   navigation for one set of screens.
 */
function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  railOnly = false,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  railOnly?: boolean
}) {
  const isMobile = useIsMobile()
  /*
    The phone, not the tablet. `useIsMobile` is `width < 768px`, which is
    exactly the range where the rail has no room to expand and no drawer to
    stand in for it; from `md` up the trigger comes back. See `railOnly`.
  */
  const locked = railOnly && isMobile
  const [openMobile, setOpenMobile] = React.useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open]
  )

  // Helper to toggle the sidebar. A locked rail has nothing to toggle — the
  // keyboard shortcut below reaches this too, so the lock has to live here
  // rather than only on the trigger.
  const toggleSidebar = React.useCallback(() => {
    if (locked) return
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [locked, isMobile, setOpen, setOpenMobile])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  //
  // A locked rail is collapsed whatever the stored preference says. The
  // preference itself is left untouched — it is the *desktop* choice, and a
  // dietitian who works on a laptop and checks the day on a tablet should find
  // their laptop the way they left it.
  const state = locked || !open ? "collapsed" : "expanded"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      locked,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar, locked]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        // The shell's own arrangement, exposed for CSS and for tests. `locked`
        // is the resolved answer (this shell, at this width); `rail-only` is the
        // shell's intent regardless of width.
        data-rail-only={railOnly ? "true" : undefined}
        data-locked={locked ? "true" : undefined}
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "inline-start",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "inline-start" | "inline-end"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const { isMobile, state, openMobile, setOpenMobile, locked } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  // A locked rail is drawn as the rail at every width, so the drawer branch is
  // skipped even on a phone. That is the whole shape change: navigation stops
  // being a thing you open over the page and becomes a column that is always
  // there.
  if (isMobile && !locked) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          dir={dir}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      // `hidden md:block` is the drawer shell's arrangement: below `md` the rail
      // is absent because the Sheet above is standing in for it. A locked rail
      // has no Sheet, so it has to be visible at every width.
      className={cn("group peer text-sidebar-foreground", locked ? "block" : "hidden md:block")}
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
      data-locked={locked ? "true" : undefined}
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=inline-end]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[inset-inline-start,inset-inline-end,width] duration-200 ease-linear data-[side=inline-start]:start-0 data-[side=inline-start]:group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)*-1)] data-[side=inline-end]:end-0 data-[side=inline-end]:group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)*-1)] md:flex",
          // Same reason as the wrapper above: with no Sheet standing in for it
          // below `md`, the locked rail has to draw itself there. The width
          // needs no help — `data-collapsible="icon"` is set on the group, so
          // the variant below resolves it to the icon column.
          locked && "flex",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=inline-start]:border-e group-data-[side=inline-end]:border-s",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  expandLabel,
  collapseLabel,
  ...props
}: React.ComponentProps<typeof Button> & {
  /**
   * What the press will do, in the reader's language, one string per state.
   *
   * Passed in rather than translated here for the reason every string in this
   * file is: `ui/` is registry code and knows nothing about the app's locales.
   * `SidebarMenuButton` takes its `tooltip` the same way, and `AppSidebar` —
   * which already holds `useTranslations('nav')` — is the one caller of both.
   *
   * Each label serves twice: it is the button's accessible name in that state,
   * and, collapsed, the text of the tooltip. Omitted, the control keeps the
   * registry's English fallback and shows no tooltip at all, so an untranslated
   * caller degrades to what this component did before rather than to a bubble
   * of English on an Arabic rail.
   */
  expandLabel?: string
  collapseLabel?: string
}) {
  const { toggleSidebar, locked, state, isMobile, openMobile } = useSidebar()

  // Nothing to toggle, so nothing to press. A control that is present and inert
  // is worse than an absent one: it invites the press and then says nothing
  // about why the rail did not move.
  if (locked) return null

  /*
    Whether the rail is currently showing its labels, which is what the glyph
    below reports. Two sources because there are two rails: a phone renders the
    drawer, whose open-ness is `openMobile`, while `state` tracks the desktop
    column and stays on whatever it was last set to underneath it.
  */
  const expanded = isMobile ? openMobile : state === "expanded"
  const label = (expanded ? collapseLabel : expandLabel) ?? "Toggle Sidebar"

  const trigger = (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      /*
        ## The fill belongs to the collapsed rail only

        Expanded, the trigger sits beside the logo in a 48px head and its job is
        already obvious from the column it is standing in; a disc under the
        pointer there is one more thing moving in the busiest row of the rail.
        Collapsed, it is the only control left in a 56px strip, so the fill is
        what says the strip is pressable at all. Same reasoning the mark itself
        follows in `layout/sidebar.tsx` — an affordance is worth drawing where
        it teaches something.

        ⚠ **The `aria-expanded:` reset is not optional.** `ghost` lights up on
        `aria-expanded` (see `button.tsx`) because the variant was written for
        menu and popover triggers, where the fill says "the thing I opened is
        still on screen". This button is a *disclosure*, not a popup trigger, so
        that assumption is wrong here and the state left a grey disc welded on
        for as long as the rail stayed open. Neutralised rather than dropped:
        the attribute is the correct semantics, only its default paint is not.

        Stated unconditionally because it can only bite while `aria-expanded` is
        true, which is exactly the state it is meant to cover. The `hover:`
        half needs the guard.

        `focus-visible` is untouched in both states — it comes from the base
        layer, and it is keyboard reachability rather than decoration.

        ## Collapsed, the fill is standing, not a hover

        `bg-sidebar-hover` with no `hover:` prefix, so the tint is simply there
        for as long as the rail is folded. Collapsed, this is one glyph alone in
        a 56px strip with no label and nothing around it; a fill that only
        appears under a pointer is a fill half the people using this — anyone on
        a touch screen — never see, and the strip reads as decoration rather
        than as the way back. Expanded, the trigger stands beside the logo with
        a whole labelled column under it and needs none of that, so it goes flat.

        **The `hover:` pair restates the same fill rather than omitting it.**
        `ghost` still carries `hover:bg-accent`, which would otherwise fire over
        the standing tint and turn the square grey on the way past — the one
        moment the colour has no business changing.

        The colour is not chosen for this button: it is character for character
        what every destination row below it takes on hover (see
        `sidebarMenuButtonVariants`), so the head of the column matches the
        column. `--sidebar-hover` is `--green-50`, one step lighter than the
        active row's `--green-100`, under `--sidebar-accent-foreground`
        (green-900) — and it is defined for the dark rail too, where the pair
        inverts to green-800 under green-200. A hand-written fill would not have
        been.

        `rounded-md` overrides `icon-sm`'s `rounded-full`: a disc is the shape of
        a floating control, and this one is a row in a column of rows.
      */
      className={cn(
        "rounded-md aria-expanded:bg-transparent aria-expanded:text-secondary-foreground",
        expanded
          ? "hover:bg-transparent hover:text-secondary-foreground"
          : "bg-sidebar-hover text-sidebar-accent-foreground hover:bg-sidebar-hover hover:text-sidebar-accent-foreground",
        className
      )}
      /*
        The glyph carries the state visually; this is the same fact for anyone
        who is not looking at it. Without it the button announces identically in
        both positions and a screen reader user has no way to know which press
        they are about to make.
      */
      aria-expanded={expanded}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      {/*
        A doubled chevron pointing at what the press will do, replacing a
        hamburger that looked the same open or shut.

        **Open, it points at the rail's own edge** — the direction the column is
        about to fold in — and closed it points back out at the page. `Icon`
        mirrors both in Arabic (they are on `DIRECTIONAL`), so on an RTL screen,
        where the rail is on the right, open reads `»` and closed reads `«`: the
        arrow follows the wall it belongs to rather than a fixed side of the
        screen.

        Do not add `rtl:-scale-x-100` here. The mirroring is already automatic
        and a second flip would cancel it — see the note on `DIRECTIONAL`.
      */}
      <Icon name={expanded ? "chevronsStart" : "chevronsEnd"} />
      <span className="sr-only">{label}</span>
    </Button>
  )

  /*
    No label, no tooltip. The bubble's text and the button's accessible name are
    the same string, so a caller that passed nothing would get a hint reading
    "Toggle Sidebar" in English over an Arabic rail — worse than the silence
    this component shipped with.
  */
  if (!expandLabel) return trigger

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent
        // `inline-end`, not `right`: collapsed, the rail sits on the
        // inline-start edge in both scripts, so its tooltips open away from it.
        // Same side the destination rows below use — see `SidebarMenuButton`.
        side="inline-end"
        align="center"
        /*
          Expanded, the trigger is beside a logo and above five labelled rows;
          the one control on screen whose purpose is least in doubt does not
          need a bubble explaining it. Collapsed, the labels are gone and the
          hint is the only text there is. Hidden on mobile for the reason the
          rows are: a drawer is opened by touch, and a touch has no hover to
          summon a tooltip with.
        */
        hidden={expanded || isMobile}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=inline-start]:-end-4 group-data-[side=inline-end]:start-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex",
        "in-data-[side=inline-start]:cursor-w-resize rtl:in-data-[side=inline-start]:cursor-e-resize in-data-[side=inline-end]:cursor-e-resize rtl:in-data-[side=inline-end]:cursor-w-resize",
        "[[data-side=inline-start][data-state=collapsed]_&]:cursor-e-resize rtl:[[data-side=inline-start][data-state=collapsed]_&]:cursor-w-resize [[data-side=inline-end][data-state=collapsed]_&]:cursor-w-resize rtl:[[data-side=inline-end][data-state=collapsed]_&]:cursor-e-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 rtl:group-data-[collapsible=offcanvas]:-translate-x-0 group-data-[collapsible=offcanvas]:after:start-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
        "[[data-side=inline-start][data-collapsible=offcanvas]_&]:-end-2",
        "[[data-side=inline-end][data-collapsible=offcanvas]_&]:-start-2",
        className
      )}
      {...props}
    />
  )
}

/**
 * The column beside the rail.
 *
 * **A `<div>`, where the registry ships a `<main>`.** Every layout that mounts
 * this already renders its own `<main>` inside it — the staff shell's scroller,
 * the portal's tab column, each account screen — so the registry's tag put a
 * `main` landmark inside a `main` landmark on every page in the app. A document
 * gets one, and a screen reader offered two has no way to tell which is the
 * page.
 *
 * The inner element is the one that should keep it, not this one: this box also
 * holds the phone app bar, and a landmark that says "the main content" while
 * containing the site navigation is worse than the nesting it would fix.
 */
function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ms-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("h-8 w-full bg-background shadow-none", className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div"> & React.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-group-label",
      sidebar: "group-label",
    },
  })
}

function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & React.ComponentProps<"button">) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-3.5 end-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-group-action",
      sidebar: "group-action",
    },
  })
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

/*
  Three departures from the registry defaults, all from docs/design-system.md.

  **Hover is `--sidebar-hover` plus an ink change**, not `--sidebar-accent`.
  The registry fills a hovered row in the same colour as the active one, which
  made the rail look like it had changed page under the pointer — so hover
  takes the lighter token, and the label and glyph move to
  `--sidebar-accent-foreground` with it. The fill says "this row is a target";
  the ink says which one.

  **The active row is exempt from all of it.** `data-active:hover:` re-asserts
  its own fill, so passing over the page you are already on changes nothing:
  its ink is already that green and its background does not move. Hover answers
  "what would I get if I clicked this", and on the current row the honest answer
  is nothing. Without that override the one-variant `hover:` rule would repaint
  the active row in the hover tint and lose the state entirely.

  `:active` (the pressed frame) carries no background of its own. The pointer is
  by definition over the row while it is pressed, so the hover fill is already
  showing; a second, briefly different fill on the way to a navigation was noise.

  **Idle label and idle glyph are one colour**, both `--sidebar-icon`. They used
  to differ — a green-800 label beside a warm-neutral glyph — which made each row
  read as two things rather than one target. The rail's brand green is now spent
  entirely on the active row and on hover, where it carries meaning.

  **The active row takes `--sidebar-hover`, the same tint a hovered row takes
  and the same one the collapsed trigger stands in.** One green in the rail
  rather than two: collapsed, the strip is a stack of small squares, and two
  green fills a step apart in it read as an inconsistency rather than as two
  meanings. What separates the active row from its neighbours is that they have
  no fill at all, plus `font-semibold` and `aria-current` — none of which a
  second shade was carrying.

  ⚠ Active and hovered are consequently the *same* colour. `data-active:hover:`
  still pins the active row so it does not move under the pointer, but a
  hovered neighbour now looks like the active row for as long as the pointer is
  on it. Restore the distinction by putting these two back to
  `bg-sidebar-accent` (green-100), which is what they were.
*/
const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-start text-sm text-sidebar-icon ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pe-8 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:px-2.5! group-data-[collapsible=icon]:py-0! hover:bg-sidebar-hover hover:text-sidebar-accent-foreground hover:[&_svg]:text-sidebar-accent-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-sidebar-hover data-active:hover:bg-sidebar-hover data-active:font-semibold data-active:text-sidebar-accent-foreground [&_svg]:shrink-0 [&_svg]:text-sidebar-icon [&_svg:not([class*='size-'])]:size-5 data-active:[&_svg]:text-sidebar-accent-foreground [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "",
        outline:
          "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-hover hover:shadow-[0_0_0_1px_var(--sidebar-border)]",
      },
      size: {
        default: "h-10 text-sm",
        sm: "h-8 text-xs",
        // 32px of avatar in a 40px collapsed button, rather than the 20px glyph
        // the default size centres.
        lg: "h-12 text-sm group-data-[collapsible=icon]:px-1!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean
    tooltip?: string | React.ComponentProps<typeof TooltipContent>
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar()
  const comp = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(sidebarMenuButtonVariants({ variant, size }), className),
      },
      props
    ),
    render: !tooltip ? render : <TooltipTrigger render={render} />,
    state: {
      slot: "sidebar-menu-button",
      sidebar: "menu-button",
      size,
      active: isActive,
    },
  })

  if (!tooltip) {
    return comp
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      {comp}
      <TooltipContent
        // `inline-end`, not `right`: collapsed, the sidebar sits on the
        // inline-start edge in both scripts, so its tooltips open away from it.
        side="inline-end"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    showOnHover?: boolean
  }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-1.5 end-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          showOnHover &&
            "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-action",
      sidebar: "menu-action",
    },
  })
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute end-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-sidebar-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean
}) {
  // Random width between 50 to 90%.
  const [width] = React.useState(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  })

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px rtl:-translate-x-px flex-col gap-1 border-s border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"a"> &
  React.ComponentProps<"a"> & {
    size?: "sm" | "md"
    isActive?: boolean
  }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "flex h-7 min-w-0 -translate-x-px rtl:translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-sub-button",
      sidebar: "menu-sub-button",
      size,
      active: isActive,
    },
  })
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
