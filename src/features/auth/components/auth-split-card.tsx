'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

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
 * The brand lockup, in two files.
 *
 * The supplied artwork draws the wordmark in #266805, which vanishes into the
 * app's dark surfaces, so `logo-full-dark.svg` repaints that one path in n-25
 * and leaves the green disc alone. Swapping the file is the whole dark-mode
 * story — no filter, no `invert`, which would have taken the green with it.
 */
const LOGO_LIGHT_SRC = '/images/logo-full.svg';
const LOGO_DARK_SRC = '/images/logo-full-dark.svg';

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

export function AuthSplitCard({ header, contentVisible, children, switcher }: AuthSplitCardProps) {
  const tApp = useTranslations('app');

  /* The fields' own fade — out fast, in a shade slower, so the form always
     arrives the same way. */
  const fade = cn(
    'transition-opacity ease-(--ease-sweep)',
    contentVisible
      ? 'opacity-100 duration-(--duration-label)'
      : 'opacity-0 duration-(--duration-reverse)',
  );

  return (
    /*
     * `bg-background` — n-0, white in light mode, and the dark theme's own
     * ground in dark. v5.html hardcodes #ffffff on three nested elements; one
     * token on the outermost is the same picture and themes itself.
     */
    <div className="flex min-h-dvh w-full bg-background">
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
      <div className="flex min-w-0 flex-1 flex-col justify-between px-4 py-6 sm:px-6 lg:px-12 short:py-3 shorter:py-2">
        {/*
          The top bar: the language control at the inline-start, the logo at the
          inline-end. Both mirror with the locale — see the note at the top of
          the file.

          `max-w-[440px] mx-auto` on all three rows, not `items-center` on the
          column: the bar has to line its two ends up with the *form's* edges,
          which means sharing the form's width rather than merely being centred
          in the same column.
        */}
        <div className="mx-auto mb-2 flex w-full max-w-110 short:mb-0 items-center justify-between gap-3">
          <LocaleSwitcher variant="dropdown" />
          <BrandLogo alt={tApp('shortName')} />
        </div>

        {/*
          The form. `my-auto` centres it in the space the bar and the footer
          leave; nothing here scrolls on its own, which is the point — see
          "`min-h-dvh`, never `h-dvh`".
        */}
        {/* No block padding of its own. `my-auto` is what centres this row, and
            padding on top of that was 32px spent twice — once here and again in
            the column's own `py-*`. It is the first thing that went when the
            footer started landing under the fold. */}
        <div className="mx-auto my-auto w-full max-w-110">
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
          <div className={cn('q-auth-fields', fade)}>{children}</div>
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
        <div className={cn('mx-auto min-h-6 w-full max-w-110 pt-4 text-center short:pt-2', fade)}>
          {switcher ? <SwitchLink switcher={switcher} /> : null}
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
        <div className="relative w-full overflow-hidden rounded-xl bg-muted">
          <Image
            src={HERO_IMAGE_SRC}
            alt=""
            fill
            priority
            unoptimized
            className="object-cover object-center"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The brand lockup, at v5.html's 40px.
 *
 * A plain `<img>`, not `next/image`: the file is an SVG, which the image
 * optimiser refuses without `dangerouslyAllowSVG` and would have nothing to do
 * with anyway — it is already resolution-independent and 2KB. `sidebar.tsx`
 * takes the same exemption for the same reason.
 *
 * Two elements rather than one with a filter. `brightness-0 invert` would have
 * turned the whole lockup white, disc included; painting the wordmark alone
 * means shipping a second file, and a second file means a second `<img>`. The
 * pair is CSS-switched, so there is no flash of the wrong one on load and no
 * theme read during render.
 */
function BrandLogo({ alt }: { alt: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- an SVG has nothing for the image optimizer to do. */}
      <img src={LOGO_LIGHT_SRC} alt={alt} className="block h-10 w-auto shorter:h-8 dark:hidden" />
      {/*
        `alt=""` on the second copy: both are in the markup at all times and only
        one is painted, so naming them both would announce the brand twice to a
        screen reader, which does not read `display`.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
      <img src={LOGO_DARK_SRC} alt="" className="hidden h-10 w-auto shorter:h-8 dark:block" />
    </>
  );
}

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
