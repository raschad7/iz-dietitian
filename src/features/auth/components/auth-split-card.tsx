'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { BrandMark } from '@/components/layout/brand-logo';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The surface every auth screen is built on, following `v5.html`: a plain
 * white page, the form in a column at the inline-start, and the illustration in
 * a rounded panel at the inline-end that bleeds off the edge of the screen.
 *
 * ## It mirrors with the language
 *
 * **This screen used to lock its outer geometry to LTR** so that the picture and
 * the form stayed on the same physical sides in both languages. That lock is
 * gone, on request: the layout is now built from logical properties like every
 * other screen, so English puts the form on the left and the picture on the
 * right, and Arabic puts the form on the right and the picture on the left.
 *
 * The language control mirrors with it — it is the first thing in the top row,
 * so it sits at the inline-start and swaps sides when the locale does. That is
 * the cost of the mirroring and it is a real one: the control you just used is
 * not where you left it. It was a deliberate trade, and `docs/design-system.md`
 * has been updated to match rather than left contradicting the code.
 *
 * There is nothing left in here that needs a `dir` of its own. If a future bug
 * looks like it wants one, it almost certainly wants a logical property instead.
 *
 * ## The picture is inset on all four sides
 *
 * v5.html sets `padding: 20px 20px 20px 0` — three sides inset and the fourth
 * flush, so the panel bleeds off the outer edge of the screen and shows only two
 * of its four rounded corners. **That is deliberately not what this does.**
 * Flush against the edge, the illustration read as unfinished rather than as
 * full-bleed: it is a framed picture, not a background, and a framed picture
 * with one edge cut off by the viewport looks like a layout bug.
 *
 * So `p-*` on all four sides. The panel floats clear of the page on every side,
 * all four corners take the 24px radius, and the inset is symmetrical, which
 * means it is also identical in both languages — no `:dir()` rule, nothing to
 * keep in step. In Arabic that is the gap down the left of the screen; in
 * English the same gap lands on the right.
 *
 * The panel is a flex child at `w-full` inside a flex container, so it takes the
 * row's full height without anything having to state one — no `h-full` chasing a
 * parent that has no definite height.
 *
 * `object-cover` on a `fill` image crops the artwork to the panel's aspect ratio
 * rather than stretching it, and the crop is centred, which is what keeps the
 * two figures at the table in frame when a 16:9 illustration is shown in a tall
 * panel.
 *
 * ## It has an entrance
 *
 * The screen opens in two beats: the picture widens out of a strip standing
 * against the outer edge of the window, and once it is ~85% open the form
 * column walks up beside it a row at a time — brand bar, heading, role switch,
 * fields, footer. Four classes — `q-auth-stage`, `q-auth-reveal`,
 * `q-auth-hero`, `q-auth-enter` (plus `-2` … `-5` for the stagger's positions)
 * — and every number, curve and direction behind them is at the foot of
 * `globals.css`, under "The sign-in screen's entrance".
 *
 * ⚠ **Two of the five parts are not in this file.** The heading and the role
 * switch are written in `AuthScreen` and arrive here as one opaque `header`
 * node, so their position classes live there. Renumbering the stagger means
 * editing both files.
 *
 * Two things there are worth knowing before touching any of it: the entrance
 * holds itself at its first frame while the launch screen is in the document,
 * because otherwise it plays underneath a full-screen tile and is never seen;
 * and the picture's offset and its scale are a single decision, not two
 * numbers. Both are written up beside the rules.
 *
 * ## Layout behavior
 *
 * - **Mobile and Tablet** (below `lg`): the picture is not rendered (`hidden lg:flex`).
 *   Phones and tablets display the centered form column.
 * - **Desktop** (`lg` and up): 48% of the viewport with a 460px floor and no
 *   ceiling. The right column displays the full-height hero illustration.
 *
 * ## And a fourth axis: height
 *
 * Width decides the columns; **height decides whether the form fits at all**,
 * and on this screen it has to. See the `short` / `shorter` variants declared in
 * `globals.css` — below 860px and 700px of viewport the column closes up its
 * gaps, shrinks the heading, and finally drops the tagline, because a sign-up
 * form is five fields deep and a 1366×768 laptop has about 650px to put them in
 * once the browser has taken its share. Control heights never move: the layout
 * gives up whitespace, not touch targets.
 *
 * ## `min-h-dvh`, never `h-dvh`
 *
 * The page is a *minimum* of one viewport tall and nothing inside it owns a
 * scroll container. Written the other way once, this screen lost its passkey and
 * Google buttons below the fold of a narrow column — and the app hides
 * scrollbars globally, so nothing on screen said the column scrolled. Short
 * forms leave the page exactly `100dvh`; tall forms grow it and let the *page*
 * scroll. There is no state in which a control renders but cannot be reached.
 *
 * `overflow-hidden` appears once, on the picture's panel, and is safe there
 * because that panel holds a decorative image and nothing else. Do not copy it
 * onto the form column — a focus ring is drawn outside its control's box, and a
 * clipped one is a missing one.
 *
 * `dvh` and not `vh`: on a phone `vh` measures the viewport with the browser
 * chrome hidden, so `100vh` overshoots whenever the chrome is showing.
 */

/**
 * Where the illustration lives.
 *
 * A file under `public/`, not an import: it is artwork swapped by whoever owns
 * the brand, not an asset the build needs to know about. Replacing the file
 * replaces the picture, with no code change.
 */
const HERO_IMAGE_SRC = '/images/auth-hero.png';

/**
 * What to paint while the photograph is still arriving.
 *
 * A 16px-wide WebP of the artwork itself, inlined — about 150 bytes, so it costs
 * one extra line of HTML and no request at all. Next generates one of these
 * automatically for a *statically imported* image; this one is loaded from a
 * runtime path (see `HERO_IMAGE_SRC` above, and why it is a path), so the
 * placeholder has to be supplied by hand. Regenerate it with sharp if the
 * artwork is ever replaced:
 *
 *     sharp('public/images/auth-hero.png').resize(16).webp({ quality: 45 })
 */
const HERO_BLUR_DATA_URL =
  'data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAADwAQCdASoQAAkAAwBSJZQAD48MokY6DLgA/uiqaukbjb1AKNlShSldakyNwCLxX1XsznHGGRwp5+YK8cSZnmk5rwnkfefpGuNOI77SdzD6SDDo303sUwbIAAA=';

/**
 * How wide a crop the browser should ask the optimiser for.
 *
 * ⚠ **This is not the panel's width, and it must not be set to it.** The panel
 * is portrait and the artwork is 16:9, so `object-cover` scales the image until
 * its *height* fills the panel and lets the sides fall outside — which means the
 * rendered image is far wider than the box it is seen through. Sizing this to
 * `48vw` (what the panel measures) hands the browser a candidate roughly half
 * the resolution it actually paints, and the result is the visible softness that
 * `unoptimized` was once reached for to hide.
 *
 * `100vw` is deliberately generous rather than exact. The true figure is
 * `panel-height × 16/9`, which depends on the viewport's *height* — something no
 * `sizes` expression can read — and on a tall narrow desktop window it exceeds
 * `100vw` outright. Over-asking costs a little bandwidth on wide short screens;
 * under-asking is the pixelation, so the error is taken in the safe direction.
 *
 * The `1px` branch is the mobile one, and it is load-bearing: the panel is
 * `hidden` below `lg`, but a `display: none` image is still fetched, so this
 * sends the browser to the smallest candidate in the srcset rather than to a
 * desktop crop nothing will ever show.
 */
const HERO_SIZES = '(min-width: 1024px) 100vw, 1px';

type AuthSplitCardProps = {
  /**
   * The page's heading, its tagline, and the role switch.
   *
   * Deliberately *outside* the `contentVisible` fade. The role switch is the
   * control being clicked, and fading it out from under the pointer mid-click is
   * how a control stops feeling connected to what it does. The heading names the
   * form that is arriving, so it changes with the switch rather than with the
   * fields.
   */
  header: ReactNode;
  /** False while the form is being swapped; see `AuthScreen`. */
  contentVisible: boolean;
  /** The form itself. `AuthSplitCard` supplies the surface and nothing else. */
  children: ReactNode;
  /**
   * The link that flips to the other form. Absent on the client view, which has
   * no sign-up to flip to — clients are issued credentials.
   */
  switcher?: {
    /** "Don't have an account?" */
    prompt: string;
    /** "Create one" */
    label: string;
    onClick: () => void;
  };
};

/**
 * ms the form area stays clipped after a swap finishes.
 *
 * The height transition and the fade run together, so for a moment the incoming
 * form is at its full natural size inside a box that is still travelling toward
 * that size — and without clipping, a taller form spills over the footer while
 * it fades up. This is `--duration-arc` (the height) plus a frame or two of
 * slack.
 *
 * ⚠ A timer, and **not** `transitionend`. Two of the three faces can be the same
 * height as each other, and a `block-size` that does not change fires no
 * transition at all — so an event-driven version would clip once and then never
 * unclip, which quietly swallows every focus ring on the screen.
 */
const CLIP_MS = 260;

export function AuthSplitCard({ header, contentVisible, children, switcher }: AuthSplitCardProps) {
  const tApp = useTranslations('app');

  /*
   * The form's measured height, driven onto the box around it so the box can
   * *travel* between two forms instead of snapping.
   *
   * `null` until the first measurement, which leaves the box at `auto` — so the
   * server renders the form at its natural height, the client hydrates to the
   * same thing, and the first measurement writes back the number it already had.
   * Nothing moves on load, and there is no style attribute to mismatch.
   */
  const fieldsRef = useRef<HTMLDivElement>(null);
  const [fieldsHeight, setFieldsHeight] = useState<number | null>(null);

  useEffect(() => {
    const fields = fieldsRef.current;
    if (!fields) return;

    /*
     * A ResizeObserver rather than a measurement per swap: the form's height
     * also changes for reasons that are not a swap — a validation error opening
     * under a field, the password field's caps-lock notice — and those deserve
     * the same travel rather than a jump.
     */
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setFieldsHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
    });
    observer.observe(fields);
    return () => observer.disconnect();
  }, []);

  /*
   * Whether to clip the form area right now — see `CLIP_MS`. It goes on the
   * moment a swap starts and comes off on a timer once the height has arrived.
   *
   * ⚠ **It must come off.** `overflow-hidden` here is otherwise exactly the bug
   * the file header warns about: a focus ring is drawn outside its control's
   * box, and a clipped one is a missing one. It is only safe during the swap
   * because the swap has just replaced the DOM, so nothing inside is focused.
   */
  const [clipHeld, setClipHeld] = useState(false);
  const [wasVisible, setWasVisible] = useState(contentVisible);

  /*
   * Adjusted during render rather than in an effect. `clipHeld` is derived from
   * a prop changing, and an effect that sets state synchronously to track a prop
   * renders twice for every swap — React documents this comparison-with-previous
   * pattern for exactly this case, and the lint rule enforces it.
   */
  if (wasVisible !== contentVisible) {
    setWasVisible(contentVisible);
    if (!contentVisible) setClipHeld(true);
  }

  /* The release. Only ever fires from inside the timer, so the effect itself
     sets no state. */
  useEffect(() => {
    if (!contentVisible || !clipHeld) return;
    const timer = window.setTimeout(() => setClipHeld(false), CLIP_MS);
    return () => window.clearTimeout(timer);
  }, [contentVisible, clipHeld]);

  const clipped = !contentVisible || clipHeld;

  /*
   * The fields' own fade — out fast, in a shade slower, so the form always
   * arrives the same way.
   *
   * The 4px of travel is vertical on purpose. A horizontal slide would have to
   * pick a direction, and the direction that reads correctly is the reading one,
   * which inverts between Arabic and English — so it would need either a
   * `:dir()` rule or the locale threaded down here. Vertical means the same
   * thing in both scripts: the old form settles, the new one rises into place.
   */
  const fade = cn(
    'transition-[opacity,translate] ease-(--ease-sweep) motion-reduce:transition-none',
    'motion-reduce:translate-y-0',
    contentVisible
      ? 'translate-y-0 opacity-100 duration-(--duration-label)'
      : 'translate-y-1 opacity-0 duration-(--duration-reverse)',
  );

  return (
    /*
     * `bg-background` — n-0, white in light mode, and the dark theme's own
     * ground in dark. v5.html hardcodes #ffffff on three nested elements; one
     * token on the outermost is the same picture and themes itself.
     */
    /*
     * `q-auth-stage` carries no style of its own — only the entrance's
     * durations and curves, as custom properties, so the picture opening and
     * the form rising are timed against one source. See the section at the foot
     * of `globals.css`; the hand-off between the two is a derived number and
     * cannot be nudged in one place alone.
     */
    <div className="q-auth-stage flex min-h-dvh w-full bg-background">
      {/*
        The form column. v5.html's `.invisible-form-box`: it takes whatever the
        picture leaves, and spaces its three rows apart — the top bar, the form,
        the footer.

        `justify-between` pins the bar to the top and the footer to the bottom;
        `my-auto` on the middle row then takes the space between them and centres
        the form in it, rather than letting it sit wherever the two ends happen
        to leave it. Both are in v5.html and both are load bearing.
      */}
      {/*
        ⚠ **The vertical rhythm in this column is a budget, not a preference.**

        The whole screen is meant to land inside one viewport with no scrolling,
        and it is close: on a 1920×900 laptop the column comes to roughly 800px
        of content against ~860px of usable height. Every gap below was set with
        that total in mind, so adding 40px anywhere is enough to push the footer
        under the fold — and when the column overflows, the *page* grows, the row
        grows with it, and the illustration beside it stretches and over-crops.
        A scrollbar is not the only thing that goes wrong.

        This column also carries one control the reference design does not: the
        passkey button, worth about 60px with its gap. The tightened spacing here
        is what pays for it. If a third alternate sign-in path is ever added, it
        does not fit — collapse them behind one "other ways to sign in" control
        rather than shaving these numbers further.
      */}
      {/*
        Note the split: **inline padding takes width variants, block padding
        takes height variants, and neither takes both.** `lg:px-12` alongside
        `short:py-3` is fine because they set different properties; a
        `lg:py-6` *and* a `short:py-3` would be two rules for `padding-block`
        whose winner depends on which media query Tailwind emits last, which is
        not something to leave to chance in a layout whose whole job is to fit.
      */}
      {/*
        ⚠ **The entrance is not on this element.** The second beat — the column
        rising once the picture beside it is most of the way open — is carried by
        the five parts *inside* the column, each with its own position in the
        stagger: the brand bar here, the heading and the role switch over in
        `AuthScreen`'s `header`, then the fields and the footer below. See
        `q-auth-enter` in `globals.css`.

        It sat on this box for one revision and moved the whole column as a
        slab. Putting it on the rows is what gives the column an order to be read
        in; putting it back here would flatten it again.

        The rows may be animated independently because none of them is measured
        against another: `translate` and `opacity` are both off the layout, so
        `mt-auto` still resolves against a column whose boxes never moved.
      */}
      <div className="flex min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 lg:px-12 short:py-3 shorter:py-2">
        {/*
          The top bar: the brand at the inline-start, the language control at the
          inline-end. Both mirror with the locale — see the note at the top of
          the file.

          **The brand leads and the utility follows**, which is the other way
          round from how this row was first built. The two were swapped because
          the order was being read, not just seen: in Arabic the inline-start is
          the *right*, so the old arrangement put a language dropdown in the
          first place the eye lands and the product's own mark last — and the
          lockup is itself drawn right-to-left, so it was sitting at the wrong
          end of its own reading direction.

          `max-w-[440px] mx-auto` on all three rows, not `items-center` on the
          column: the bar has to line its two ends up with the *form's* edges,
          which means sharing the form's width rather than merely being centred
          in the same column.
        */}
        {/* First of the five, and no position class: it is the top of the
            column and the top of the stagger. */}
        <div className="q-auth-enter mx-auto mb-2 flex w-full max-w-110 short:mb-0 items-center justify-between gap-3">
          <BrandMark aria-hidden={false} role="img" aria-label={tApp('shortName')} className="size-9 shorter:size-8" />
          <LocaleSwitcher variant="dropdown" />
        </div>

        {/*
          The form, anchored below the bar rather than centred between it and the
          footer.

          ⚠ **This row used to be `my-auto` inside a `justify-between` column,
          and that is what made the role switch jump.** Centring measures the
          whole block — heading, tagline, switch *and* fields — so every time the
          fields changed height the block re-centred and dragged the controls
          above them along with it. Measured at 1280×720 the switch sat 136px
          further down on the client form than on sign-up, which is a control
          moving out from under the pointer that just clicked it.

          Anchoring costs the vertical centring on a tall screen, and the fixed
          offset below is what buys most of it back: it is roughly where centring
          put the default form, so the common case looks unchanged and the other
          two faces no longer drag the header around. Growth now goes downward
          only, into the slack `mt-auto` holds above the footer.
        */}
        {/*
          The offset is a compromise between the two faces, and it is chosen
          against the *tallest* one. Sign-up is five fields deep and already the
          form that decides whether this screen scrolls — every pixel spent here
          comes off its bottom margin first. 48px is roughly where centring used
          to put the default form on a 900px screen, so the common case looks
          unchanged, and it leaves sign-up within a few pixels of where it was.
          The height variants take it down further on the laptops that need it.
        */}
        <div className="mx-auto mt-12 w-full max-w-110 short:mt-4 shorter:mt-2">
          {header}
          {/*
            `q-auth-fields` is the scoped field theme from globals.css: it fills
            every `.q-field` below it at rest and empties it again on focus,
            which is how v5.html draws its inputs. Scoped rather than applied to
            `.q-field` itself, because the rest of the app's forms sit on cards
            where a filled resting state reads as a column of grey slabs — the
            reasoning is written out beside the rule.

            It sits on the wrapper rather than on each form so all three faces —
            staff sign-in, staff sign-up, client sign-in — pick it up without
            each having to remember to.
          */}
          {/*
            The sizer. Two elements, and they cannot be one: the outer box is
            what *travels* between the two heights, and the inner one has to stay
            at its own natural height for the ResizeObserver to have anything to
            measure. Collapsing them would make the observer read back the
            animated height it had just written, one frame at a time.
          */}
          {/*
            Fourth of the five. The entrance goes on the *sizer* and not on the
            `q-auth-fields` box inside it, which is already carrying the swap
            crossfade — two things writing `opacity` and `translate` on one
            element, one a transition and one an animation, is a handover with
            nothing to gain from it. Here they are simply on different boxes.

            Nothing is disturbed by animating this element: the ResizeObserver
            watches the child, and `translate` does not change a border box.
          */}
          <div
            className={cn(
              'q-auth-enter q-auth-enter-4',
              'transition-[block-size] duration-(--duration-arc) ease-(--ease-sweep)',
              'motion-reduce:transition-none',
              clipped && 'overflow-hidden',
            )}
            style={fieldsHeight === null ? undefined : { blockSize: fieldsHeight }}
          >
            <div ref={fieldsRef} className={cn('q-auth-fields', fade)}>
              {children}
            </div>
          </div>
        </div>

        {/*
          The footer, pinned to the bottom of the column rather than hung under
          the form — that is where v5.html puts it, and it is why the column is
          `justify-between` at all.

          It carries the same fade as the fields, because what it says depends on
          which form is showing: it must not read "Already have an account?" for
          140ms over a form that is on its way to being sign-in.

          The row renders even when there is no switcher — the client view has
          none — so that the form above it stays put instead of dropping half a
          line when the card turns over. `min-h-6` is one line of it.
        */}
        {/* `mt-auto` is what pins it now that the column is no longer
            `justify-between` — see the note on the form row above. */}
        {/*
          Last of the five, which is also where it belongs in the reading.

          Two boxes for the same reason the fields row has two: the entrance and
          the swap crossfade both write `opacity` and `translate`, so they are
          kept on separate elements rather than handed between an animation and a
          transition on one. The outer box keeps every layout class — `mt-auto`
          has to stay on the flex child — and the inner one does nothing but
          fade.
        */}
        <div className="q-auth-enter q-auth-enter-5 mx-auto mt-auto min-h-6 w-full max-w-110 pt-4 text-center short:pt-2">
          <div className={fade}>{switcher ? <SwitchLink switcher={switcher} /> : null}</div>
        </div>
      </div>

      {/*
        The picture.

        Not rendered below `lg` (mobile and tablet): Tailwind's `lg:` media query
        keeps this hidden on mobile and tablet screens (`hidden lg:flex`).
      */}
      <div
        className={cn(
          'hidden shrink-0 lg:flex lg:w-[48%] lg:min-w-115 lg:p-5',
          'lg:sticky lg:top-0 lg:h-dvh',
        )}
      >
        {/*
          `q-auth-reveal` is the first beat: this surface is clipped to a strip
          against the outer edge of the window on first paint and opens inward
          toward the form.

          The clip goes here, on the surface, and the counter-motion goes on the
          image inside it — they cannot share an element, because a `translate`
          on this box would carry the window along with the picture instead of
          the picture moving through it.

          `rounded-xl` and the animation's radius are the same value stated
          twice; the note beside the class says which token, and they have to
          agree or the corners pop when the clip is dropped at the end.
        */}
        <div className="q-auth-reveal relative w-full overflow-hidden rounded-xl bg-muted">
          {/*
            ⚠ **No `unoptimized`.** It was here to cure a soft, pixelated
            illustration, and it did — by switching the whole image pipeline off
            and shipping the 2.2MB source PNG to every visitor, unresized and
            unconverted, on the one screen that is somebody's first impression of
            the product.

            The pixelation was never the optimiser's doing. It was `sizes`
            describing the *panel* while `object-cover` painted something much
            wider, so the browser dutifully picked a candidate about half the
            resolution it needed — see `HERO_SIZES`, which is where that is fixed
            properly. With it correct the optimiser serves AVIF at the width this
            panel actually paints, which is a fraction of the PNG and sharper
            than it was.

            `priority` stays: this is the largest thing on the screen and the
            thing the layout is built around, so it is the LCP element and has no
            business waiting behind anything.
          */}
          <Image
            src={HERO_IMAGE_SRC}
            alt=""
            fill
            priority
            sizes={HERO_SIZES}
            placeholder="blur"
            blurDataURL={HERO_BLUR_DATA_URL}
            /*
              `q-auth-hero` is the picture's own travel during the reveal —
              toward the closing edge, so it slides right-to-left in Arabic and
              left-to-right in English, and settles as the panel finishes
              opening.

              ⚠ It starts oversized as well as offset, and the two figures are
              one decision: the scale is exactly what keeps the leading edge
              flush against the panel while the offset unwinds. Read the note
              beside the class before touching either.
            */
            className="q-auth-hero object-cover object-center"
          />
        </div>
      </div>
    </div>
  );
}

/*
 * The local `BrandLogo` that used to live here is gone, and with it two files
 * and two network requests.
 *
 * It drew the full lockup as a pair of `<img>` elements — `logo-full.svg` and
 * `logo-full-dark.svg` — both always in the markup, one hidden by CSS, because
 * the supplied artwork paints its wordmark in a green that disappears against a
 * dark surface and there is no way to repaint one path inside a file behind
 * `<img src>`.
 *
 * `BrandMark` has no wordmark to repaint, and it is inline SVG, so its fills
 * read `--brand-leaf` / `--brand-seed` straight from the stylesheet: one element,
 * no second file, and the dark theme handled by the same tokens as everything
 * else. See `@/components/layout/brand-logo` for why this screen wants the mark
 * alone rather than the lockup.
 */

/**
 * "Already have an account? **Sign in**" — a line of text with one word in it
 * that does something, not a button.
 *
 * `Button variant="link"` rather than a bare `<button>` so it keeps the system's
 * focus ring and its disabled behaviour, with the height and padding stripped —
 * a link is a run of text and has no box. `variant="link"` already draws in
 * olive, which is v5.html's `--primary-dark` on the same word.
 */
function SwitchLink({ switcher }: { switcher: NonNullable<AuthSplitCardProps['switcher']> }) {
  return (
    <p className="text-body-sm text-muted-foreground">
      {switcher.prompt}{' '}
      <Button
        type="button"
        variant="link"
        onClick={switcher.onClick}
        className="h-auto max-w-none p-0 align-baseline font-semibold"
      >
        {switcher.label}
      </Button>
    </p>
  );
}
