import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Shape: all four corners hold the 10px system radius. The control still sinks
 * 1px on press, but its geometry does not change under the pointer — a corner
 * that moves while you are reading the label is motion with nothing to say.
 *
 * Icon buttons are a plain circle, so round and rectangular buttons read as the
 * same family.
 */
const buttonVariants = cva(
  [
    // `max-w-80` + `whitespace-nowrap`: a label never wraps, so a button that
    // would need two lines is a label that needs rewriting.
    "group/button inline-flex max-w-80 shrink-0 items-center justify-center whitespace-nowrap select-none",
    "rounded-[10px] border bg-clip-padding text-body-md font-medium",
    "transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] outline-none",
    // `not-aria-[haspopup]` exempts menu triggers: a control that opens a
    // surface should not appear to sink under it.
    "active:not-aria-[haspopup]:translate-y-px",
    // Lime ring + green-950 halo. Fields deliberately use a different focus
    // treatment — see the note in globals.css.
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo",
    /*
     * Disabled is a fade, not a fill.
     *
     * It used to repaint the control: `bg-muted`, a transparent border and an
     * n-500 label, so every disabled button became the same gray box whatever
     * it had been a moment earlier. That box is a *different control* rather
     * than the same one unavailable — a ghost button, which has no background
     * at all, grew one when it was turned off, which is the loudest a ghost
     * button ever got. A pager sitting on page one drew two gray slabs around
     * its own chevrons.
     *
     * Opacity keeps the control's own identity: the solid one stays olive, the
     * ghost one stays transparent, the outline one keeps its border, and all
     * three read as unavailable at the same glance. It is also what every other
     * primitive in this system already does — `Segmented`, `Switch`, the
     * calendar's day cells and `Label`'s peer state are all `opacity-50`, and
     * this was the one control disagreeing with them.
     *
     * ⚠ Contrast is deliberately traded here. 50% takes a 5.46:1 label under
     * the 4.5:1 floor, which is the standard exemption for disabled controls
     * (WCAG 1.4.3) and the reason a disabled control must never be the only
     * carrier of information. `disabled:pointer-events-none` keeps it out of
     * the pointer's way; `disabled` itself keeps it out of the tab order.
     */
    "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        /**
         * Primary — solid olive, white label.
         *
         * **The label is white everywhere now.** It was n-900, and a white one
         * was a second variant (`primaryWhite`) named at the eleven call sites
         * that had asked for it — the landing CTA, the auth submits, both "New
         * client" buttons, WhatsApp connect, and the client record's primaries.
         * Two solid olive buttons with different labels is a fork a reader
         * notices before a designer does: the same action wore two looks
         * depending on which screen it was on. The fork is closed in favour of
         * the white one, which is what the brand has been asked for by name
         * every time it came up, and `primaryWhite` is gone rather than left as
         * an alias so there is one way to spell a primary.
         *
         * The colour is `--primary-foreground-white` in `globals.css`, beside
         * `--primary-foreground` — a token, not a `text-white` per site.
         *
         * ⚠ Contrast is traded, and knowingly — and the bill went up. White on
         * the brand's leaf green (`#75CF48`) measures about 1.95:1; it was
         * ~2.68:1 while `--primary` was the darker `#72AE34`. WCAG AA asks 4.5:1
         * for body text, so this was already an exception and is now a larger
         * one. `--primary-foreground` is n-900 — about 10.8:1 on this fill, and
         * *better* than it was — and stays that way for the surfaces that read
         * it. Switching this variant to that token is the one-line fix if the
         * pairing is revisited; keeping white is a look the product chose
         * deliberately, and it is recorded here and on the token. Where a label has to be *read* rather than pressed — a
         * dense list, a small control — `soft` and `neutral` are the checked
         * pairs.
         */
        default:
          "border-transparent bg-primary text-primary-foreground-white hover:bg-primary-hover",

        /**
         * Primary, quietly — the brand's subtle fill, an olive label, no border.
         *
         * For the one action on a screen that is otherwise all reading. The
         * portal's appointments page is the case: a solid olive bar sat above
         * the next appointment and outweighed it, which is backwards on a screen
         * opened to find out when that appointment is. This still reads as the
         * page's action — it is the only filled thing above the fold — without
         * being the loudest thing on it.
         *
         * Not a replacement for `default`. Where a button closes a decision —
         * a form's submit, a dialog's confirm — the solid fill is the one that
         * says so. green-700 on green-50 is 7.37:1.
         */
        soft: "border-transparent bg-secondary text-secondary-foreground hover:bg-primary-subtle",

        /**
         * Secondary — white box, green border and label, flipping to the
         * accent fill on hover. The label darkens to green-950 with it, and has
         * to: a mid-ramp green on a light green fill fails, green-950 on it is
         * about 9.9:1.
         */
        outline:
          "border-primary bg-card text-secondary-foreground hover:border-accent-green hover:bg-accent-green hover:text-on-accent aria-expanded:border-accent-green aria-expanded:bg-accent-green aria-expanded:text-on-accent",

        /** Tertiary — no box until you touch it, then a warm neutral flip. */
        ghost:
          "border-transparent text-secondary-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground",

        /**
         * Neutral — a real box, a black label, and no brand colour at all.
         *
         * For a row of peers where exactly one control is the action and the
         * rest are not. `outline` and `ghost` both draw their label in olive,
         * which is the system saying "act on me"; four of them side by side say
         * it four times and the actual primary stops being findable. This one
         * takes an edge so it still reads as pressable, and gives the colour
         * back to the button that has earned it.
         *
         * The planner's toolbar is the case: publish is the decision, while
         * "new week", "edit plan" and "compare" are simply things you may also
         * do. n-900 on white is 16.64:1.
         *
         * `aria-pressed` fills it rather than tinting it, so a toggle's on-state
         * is legible without spending the brand colour on a view preference.
         */
        neutral:
          "border-border bg-card text-foreground hover:bg-accent aria-pressed:border-input aria-pressed:bg-accent aria-expanded:bg-accent",

        /**
         * Neutral, tertiary — `ghost`'s shape with `neutral`'s colour. No box,
         * no brand hue, a black glyph.
         *
         * For a control that *repeats down a list*. `ghost` draws its label in
         * olive, which is the system saying "act on me" — fine once, and wrong
         * twenty times: the register's rows each carry three icon buttons, so
         * `ghost` put sixty olive marks on a screen whose actual brand accent is
         * the "New client" button at the top, and the table read as a grid of
         * links rather than as a list of people. Black glyphs recede into the
         * row until the pointer is on them, which is what a row action should
         * do; the neutral hover fill is what says it is pressable.
         *
         * The same reasoning as `neutral`, one step quieter — see it above for
         * why a row of peers must not all wear the brand colour.
         */
        neutralGhost:
          "border-transparent text-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent",

        /**
         * Accent — the accent fill itself, for a completion action. Hover steps
         * *down* the ramp to green-400 rather than up: the fill is already
         * light, so the response has to darken to be felt. green-950 stays
         * legible on it at about 8:1.
         */
        accent: "border-transparent bg-accent-green text-on-accent hover:bg-[var(--green-400)]",

        /**
         * Destructive — a red outline, never a solid red block. A delete is a
         * deliberate act, so it is legible rather than loud. 6.24:1 at rest,
         * 5.38:1 on the --red-tint hover fill.
         */
        destructive:
          "border-destructive bg-card text-destructive hover:bg-destructive-subtle focus-visible:ring-destructive",

        /**
         * Destructive, tertiary — `ghost`'s shape with `destructive`'s colour.
         * No box until you touch it, then the --red-tint fill; the label and
         * glyph are red the whole time, so the control never hides what it does.
         *
         * For a destructive action sitting *among* other controls rather than
         * closing a decision: the rail's sign-out is stacked under a language
         * switcher, and an outlined box there read as one more destination while
         * everything around it was boxless. Where a destructive action is the
         * decision — a delete inside a confirm dialog — use `destructive`, which
         * carries the edge that says so.
         *
         * 6.84:1 at rest, 5.81:1 on the hover fill, same as `destructive`.
         */
        destructiveGhost:
          "border-transparent text-destructive hover:bg-destructive-subtle hover:text-destructive focus-visible:ring-destructive",

        /**
         * Secondary-subtle. Not one of the six named variants, but the brand
         * tint is what several dense surfaces already reach for, and having it
         * here keeps them off ad-hoc green-50 classes.
         */
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-[var(--green-100)]",

        /**
         * Primary, at rest. Olive-100 with an olive label, filling to the solid
         * primary — white label and all — under the pointer.
         *
         * The same move the dashboard's next session and its quick actions
         * make, as a control: for the affirmative action on a card that is
         * itself something you read, where a solid olive block would make the
         * loudest thing on the page the one you are meant to consider first
         * rather than act on first. It still fills in, so the button that
         * commits has somewhere to go.
         *
         * green-700 on green-100 is 6.51:1 — so the *resting* state, the one
         * that has to be readable, passes. The hover fill is green-500 under a
         * white label at 3.47:1, which is `default`'s own knowing brand
         * failure (see the ⚠ note in docs/design-system.md); this variant does
         * not add one, it inherits it, and only in the transient state.
         *
         * `primary-subtle` remaps in dark mode, so this needs no second
         * definition there.
         */
        primarySubtle:
          "border-transparent bg-primary-subtle text-secondary-foreground hover:bg-primary hover:text-primary-foreground-white",

        /**
         * Inline text link. The one place `rounded-none` is legal, because a
         * link is a run of text, not a surface — it has no corners at all.
         */
        link: "rounded-none border-transparent text-secondary-foreground underline-offset-4 hover:underline",
      },
      /*
       * Two heights, and only two.
       *
       * `default` is 48px because that is the floor for a touch target, and a
       * control that is comfortable on a phone is not uncomfortable on a
       * desktop. `sm` is the 40px compact size and is **pointer-only** — it is
       * for toolbars and table rows, where a control sits inside a dense row
       * that is itself the target. Never reach for it to fit more onto a
       * screen; that is a layout problem, not a button problem.
       *
       * Icon buttons match: 48×48, or 40×40 under the same pointer-only rule.
       */
      size: {
        default: "h-12 gap-2 px-5",
        sm: "h-10 gap-2 px-5",
        icon: "size-12 rounded-full [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-10 rounded-full",
        /*
         * The floating action — a 56px circle carrying a 24px glyph, for a
         * control that sits *over* the page rather than in it.
         *
         * A third size, and it earns one. `icon` is 48px because that is the
         * touch floor for a control inside a layout that already frames it; a
         * button floating free over a scrolling list has nothing framing it,
         * and 56px is the size at which it stops reading as a stray chip. The
         * glyph steps to 24px with it — a 20px mark in a 56px circle leaves a
         * ring of empty fill.
         *
         * It is deliberately outside the `default` + `icon` compound below, so
         * it keeps `default`'s solid olive and white glyph rather than that
         * compound's pale olive chip. A pale circle is right for a control
         * living in a toolbar and wrong for the only action on a screen: this
         * one has to be findable from anywhere on the page, and the fill is
         * what makes it so.
         *
         * ⚠ Not a general-purpose size. One floating action per screen, and
         * only where the screen has exactly one thing to do — the same rule
         * `accent` carries. If a second one appears, the screen wants a
         * toolbar, not two circles.
         */
        fab: "size-14 rounded-full [&_svg:not([class*='size-'])]:size-6",
      },
    },
    compoundVariants: [
      /*
       * The icon button is a size *and* a skin — pale olive chip, green-200
       * border, olive glyph — and CVA cannot express "this fill only when
       * round". A compound variant can.
       */
      ...(["icon", "icon-sm"] as const).map((size) => ({
        variant: "default" as const,
        size,
        class: "border-[var(--green-200)] bg-[var(--green-50)] text-primary hover:bg-[var(--green-100)]",
      })),
      /*
       * Tertiary controls carry 12px of padding rather than 20px. A ghost
       * button has no box at rest, so the wider padding reads as a gap someone
       * forgot rather than as part of the control.
       *
       * `destructiveGhost` is in here for the same reason it is ghost-shaped at
       * all: it has no box either, and 20px would leave it sitting differently
       * from the tertiary controls it appears beside.
       */
      ...(["ghost", "destructiveGhost"] as const).flatMap((variant) =>
        (["default", "sm"] as const).map((size) => ({ variant, size, class: "px-3" })),
      ),
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
