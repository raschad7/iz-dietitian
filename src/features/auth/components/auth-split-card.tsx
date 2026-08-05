'use client';

import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The one card every auth screen is built on: a card inside a card.
 *
 * The outer surface is solid olive edge to edge. The form is a second, white
 * card lying *over* it at 60% of the width — full height, flush to the outer
 * card's own edges, with only its inner corners visible. So the olive is not a
 * panel beside the form; it is the thing the form is sitting on, and the 40%
 * that shows is whatever the form is not covering.
 *
 * Both surfaces take the same 24px radius. The outer card clips, so the form's
 * outer corners are cut to the outer card's arc and only the two facing the
 * olive are its own — matching radii is what keeps a sliver of olive from
 * peeking through at each corner, which is what a smaller inner radius does the
 * moment the two are flush.
 *
 * ## The form card is the constant
 *
 * Everything here is arranged so that the white card never changes size and the
 * two things that *do* move both leave it where it was:
 *
 * - **`formSide`** swaps the two halves. The form rests at the inline-end for
 *   signing in and travels to the inline-start for signing up, with the brand
 *   half sliding the other way to meet it. Both are `transform`s on a flex row,
 *   so the travel is a compositor job and neither half reflows mid-slide. The
 *   distances are each half's own share of the row expressed as a fraction of
 *   *itself*: the brand half crosses 60% of the row, which is 150% of its own
 *   40% width; the form crosses 40%, which is 66.67% of its own 60%. They need
 *   no `rtl:` counterparts, because the row itself is direction-locked — see
 *   `dir` below.
 * - **`showBrandPanel`** is the client view, and there the card *shrinks*
 *   rather than being replaced. The olive half collapses to nothing behind the
 *   form while the card narrows to 60% of the stage, and because the card is
 *   centred it takes 20% off each side — which lands the form, still 60% wide,
 *   in the middle of the page. Sign-in and sign-up both arrive there: the
 *   `formSide` transform runs down to zero on the way, so it does not matter
 *   which edge the form started from.
 *
 * ## `pace`
 *
 * Those two gestures are different sizes and cannot share a duration, and a
 * single element cannot carry two of them: the card's width and the halves'
 * transforms move *together* while the card shrinks, and only the transforms
 * move while the halves swap. The caller knows which is in flight, so it says.
 *
 * ## The fields do not travel
 *
 * `contentVisible` is what makes either gesture read as a swap rather than as a
 * carousel. The caller drops it the moment something changes and raises it once
 * the card has settled, so the fields — and the brand half's own contents —
 * fade out where they are, the empty card moves, and the new ones fade up in
 * place. Watching a form slide past is how you lose track of which field you
 * were in.
 *
 * ## Below `md` there is no split
 *
 * A 40/60 landscape card does not fit a phone, so the brand half is dropped and
 * the form fills the card at its natural height — no width or transform there
 * changes at all. The switch link has to survive that, which is why this
 * component renders it and not the caller: once on the brand half and once at
 * the foot of the form, with only ever one of the two displayed, so neither the
 * tab order nor the accessibility tree sees both.
 */
type AuthSplitCardProps = {
  /** False for the client view — the olive collapses and the card shrinks to the form. */
  showBrandPanel: boolean;
  /**
   * Which edge the form card rests against. `end` is sign-in — the brand half
   * leads, the way the reference layout has it — and `start` is sign-up.
   * Ignored while `showBrandPanel` is false; there is no other half to sit
   * beside.
   */
  formSide: 'start' | 'end';
  /** The brand half's one line of copy, under the leaf. */
  tagline: string;
  /** Which gesture is in flight, so the two can move at their own speeds. */
  pace: 'panel' | 'card';
  /** False while anything is travelling; see "The fields do not travel". */
  contentVisible: boolean;
  /** The form itself. `AuthSplitCard` supplies the surface and nothing else. */
  children: ReactNode;
  /**
   * The link that flips the card to the other form. Absent on the client view,
   * which has no sign-up to flip to — clients are issued credentials.
   */
  switcher?: {
    /** "Don't have an account?" */
    prompt: string;
    /** "Create one" */
    label: string;
    onClick: () => void;
  };
};

export function AuthSplitCard({
  showBrandPanel,
  formSide,
  tagline,
  pace,
  contentVisible,
  children,
  switcher,
}: AuthSplitCardProps) {
  const reversed = showBrandPanel && formSide === 'start';

  /*
   * The card's *layout* is locked to LTR; its contents are not.
   *
   * Sign-in puts the form on the right and sign-up puts it on the left, in both
   * languages. Mirroring the split with the page turned the two states into
   * four, and switching language flipped the card underneath someone who had
   * only asked for different words — the halves swapping sides is this card's
   * one gesture, and the language control is not allowed to spend it.
   *
   * So the flex row runs left-to-right regardless, and each half hands the
   * document's own direction back to everything inside it. Only the geometry is
   * pinned: every label, field, placeholder and glyph below still reads and
   * aligns per locale. It is also what lets the `translate-x` pairs drop their
   * `rtl:` counterparts — with the row pinned, +150% is the same side always.
   */
  const dir = getLocaleDirection(useLocale() as Locale);

  /*
   * `width` and `transform` share one duration per element, so the choice is
   * per gesture rather than per property: while the card shrinks they have to
   * move as one piece, and while the halves swap only the transforms are
   * changing and the longer time would just be slack.
   */
  const travel = cn(
    /*
     * `translate`, not `transform`. Tailwind v4's `translate-x-*` sets the
     * **standalone `translate` property** — `translate: var(--tw-translate-x)
     * var(--tw-translate-y)` — and leaves `transform` untouched, which is why
     * its own `transition-transform` expands to `transform, translate, scale,
     * rotate` rather than to `transform` alone. Listing only `transform` here
     * is a silent no-op: the class changes, the computed `translate` changes,
     * nothing is in the transition list to animate it, and both halves snap
     * into place instead of travelling.
     */
    'transition-[width,translate] ease-(--ease-sweep)',
    pace === 'card' ? 'duration-(--duration-travel)' : 'duration-(--duration-arc)',
  );

  /* The fields' own fade — out fast, in a shade slower, and identical for both
     gestures so the form always arrives the same way. */
  const fade = cn(
    'transition-opacity ease-(--ease-sweep)',
    contentVisible ? 'opacity-100 duration-(--duration-label)' : 'opacity-0 duration-(--duration-reverse)',
  );

  return (
    /*
     * The outer card. Solid olive with white on it — the system's known 3.47:1
     * trade-off, documented in docs/design-system.md under Buttons and repeated
     * on every `bg-primary text-primary-foreground` surface. The tagline is
     * 24px, which clears the 3:1 large-text floor; the switch line does not, and
     * rides the same brand decision the primary button already makes.
     *
     * No padding: the form card is flush to these edges, so the only inset the
     * olive gets is the one the brand half carries itself. The height is fixed
     * and only at the widths that have a split.
     */
    <div
      dir="ltr"
      className={cn(
        'relative mx-auto flex w-full flex-col overflow-hidden rounded-xl bg-primary text-primary-foreground',
        'shadow-elevated md:h-[40rem] md:flex-row',
        travel,
        showBrandPanel ? 'md:w-full' : 'md:w-3/5',
      )}
    >
      {/*
        `inert` while collapsed: the half is still in the DOM at zero width, and
        the switch link inside it must not stay in the tab order.
      */}
      <aside
        dir={dir}
        inert={!showBrandPanel}
        className={cn(
          'hidden shrink-0 overflow-hidden md:flex',
          travel,
          showBrandPanel ? 'md:w-2/5' : 'md:w-0',
          reversed ? 'md:translate-x-[150%]' : 'md:translate-x-0',
        )}
      >
        {/*
          The padding lives in here rather than on the half itself: with
          `box-sizing: border-box` a padded box cannot narrow past its own
          padding, so `w-0` would leave 80px of olive standing. This overflows
          the collapsing half instead and is clipped by it — invisibly, since it
          is faded out for the whole gesture.
        */}
        <div className={cn('flex h-full w-full min-w-0 flex-col p-10', fade)}>
          <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
            {/*
              Standing in for an illustration. Lime is a fill and never a
              foreground, and this is a fill: a drawn shape carrying no text and
              nothing a reader has to get from it.
            */}
            <Icon name="leaf" className="size-44 text-accent-lime/80 lg:size-60" />
            <p className="font-heading text-heading-lg">{tagline}</p>
          </div>

          {switcher ? <SwitchLink switcher={switcher} tone="onBrand" /> : null}
        </div>
      </aside>

      {/*
        The form card. Full height and flush to the outer card's edges — the flex
        row stretches it, and neither surface carries padding between them.

        A nested panel normally takes no shadow of its own — but this one is not
        part of the surface behind it, it is lying on top of it, so it keeps the
        card shadow. Only the edge facing the olive shows it; the other three are
        clipped by the outer card, which is exactly right.
      */}
      <div
        dir={dir}
        className={cn(
          'flex w-full shrink-0 flex-col overflow-hidden rounded-xl bg-card text-card-foreground shadow-card',
          travel,
          showBrandPanel ? 'md:w-3/5' : 'md:w-full',
          reversed ? 'md:-translate-x-[66.6667%]' : 'md:translate-x-0',
        )}
      >
        {/*
          The language control, in the flow rather than pinned to a corner: a row
          of its own reserves the space, so a tall form can never run underneath
          it, and the form below centres in what is left — which is where the
          reference layout puts it too.

          `dir="ltr"` on the row is deliberate and is the whole point. This is the
          control that *causes* the direction flip, and a switcher that jumps to
          the opposite corner the moment you use it reads as the page having
          moved rather than as the language having changed — you lose the thing
          you just clicked. Locking the row keeps it, its chevron and its open
          menu on the same side in both locales.

          It is the screen's only copy: there is neither a rail nor an app bar
          here, and there is only ever one form card on the page.
        */}
        <div dir="ltr" className="flex shrink-0 justify-end p-3">
          <LocaleSwitcher variant="dropdown" />
        </div>

        {/*
          `min-h-0` is what lets this scroll: a flex child's default `min-height:
          auto` refuses to shrink below its content, so without it the form would
          push the card taller instead of scrolling inside a card whose height
          cannot move.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center px-6 pb-8 sm:px-8">
            <div className={cn('w-full max-w-md', fade)}>
              {children}

              {/* The brand half's switcher, for the widths that have no brand half. */}
              {switcher ? (
                <div className="mt-8 border-t border-border pt-6 md:hidden">
                  <SwitchLink switcher={switcher} tone="onCard" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "Already have an account? **Sign in**" — a line of text with one word in it
 * that does something, not a button.
 *
 * It used to be an `outline` button. On the brand half that put a second solid
 * box on the card, competing with the form's own submit for the one thing the
 * eye lands on; this is a way *out* of the form you are looking at, and it
 * should read as an aside. `Button variant="link"` rather than a bare `<button>`
 * so it keeps the system's focus ring and its disabled behaviour, with the
 * height and padding stripped — a link is a run of text and has no box.
 */
function SwitchLink({
  switcher,
  tone,
}: {
  switcher: NonNullable<AuthSplitCardProps['switcher']>;
  tone: 'onBrand' | 'onCard';
}) {
  return (
    <p className={cn('text-center text-body-md', tone === 'onCard' && 'text-muted-foreground')}>
      {switcher.prompt}{' '}
      <Button
        type="button"
        variant="link"
        onClick={switcher.onClick}
        className={cn(
          'h-auto max-w-none p-0 align-baseline font-semibold underline',
          tone === 'onBrand' && 'text-primary-foreground',
        )}
      >
        {switcher.label}
      </Button>
    </p>
  );
}
