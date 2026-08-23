import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A short statement the reader has to notice, on a tinted surface.
 *
 * Four of these were being hand-rolled across two screens — the nutrition tab's
 * status strip, the portal card's WhatsApp notice, its one-time credentials box
 * and its revoke result — each with its own padding, radius and text size, and
 * two of them with no glyph at all. This is that shape, once.
 *
 * ## Tone is what happened, not how loud to be
 *
 * The tones map onto the status tokens rather than onto a severity ladder, which
 * is the same rule `Badge` follows. `attention` is amber and means someone has
 * to do something; `medical` is clay and is reserved for a real allergy,
 * condition or contraindication; `neutral` is the sunken fill and is for a fact
 * worth stating out loud — "no allergens recorded" — rather than a problem.
 *
 * There is deliberately no `success` tone. The system has no green-means-go
 * colour, and a callout that only confirms is usually a callout that could be
 * deleted.
 *
 * Each tone brings the glyph that pairs with its token, so a caller cannot put
 * the warning triangle on a neutral note by accident; `icon` overrides it where
 * the subject is more specific than the tone (the WhatsApp notice is neutral,
 * but its glyph is WhatsApp).
 */
// `body-md` (16px), the scale's stated default and its mobile minimum. A
// callout is something the reader has to take in, and Arabic loses legibility
// at 14px well before Latin does — the i'jam collapse into the letterform.
const calloutVariants = cva('flex items-start gap-3 rounded-md px-4 py-3 text-body-md', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      attention: 'bg-status-attention-bg text-status-attention-fg',
      medical: 'bg-status-medical-bg text-status-medical-fg',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

const TONE_ICONS = {
  neutral: 'info',
  attention: 'attention',
  medical: 'medical',
} as const satisfies Record<NonNullable<VariantProps<typeof calloutVariants>['tone']>, IconName>;

type CalloutProps = React.ComponentProps<'div'> &
  VariantProps<typeof calloutVariants> & {
    /** Overrides the tone's own glyph where the subject is more specific. */
    icon?: IconName;
    /**
     * A bold lead-in above the body. Use it when the callout says both *what*
     * happened and *what to do*; a single-sentence callout needs no title.
     */
    title?: React.ReactNode;
    /**
     * Adds a dismiss control at the inline-end. Passing it makes this a client
     * subtree — a handler cannot cross the RSC boundary — which is why it lives
     * on the prop rather than being built in: a server-rendered callout keeps
     * costing nothing.
     *
     * ⚠ **Only for a callout the reader may legitimately stop seeing.** A
     * missing-field notice disappears when the field is filled and has no
     * business being dismissible; a standing contradiction the dietitian has
     * looked at and accepted does. Dismissal is the caller's to remember — see
     * `DismissibleCallout` for the one that persists it.
     */
    onDismiss?: () => void;
    /** Accessible name for the dismiss control. Required whenever `onDismiss` is. */
    dismissLabel?: string;
  };

function Callout({
  tone,
  icon,
  title,
  onDismiss,
  dismissLabel,
  className,
  children,
  ...props
}: CalloutProps) {
  // `??` and not a destructured default: cva's `VariantProps` admits `null` as
  // well as `undefined`, and a default parameter only answers the second.
  const resolved = tone ?? 'neutral';

  return (
    <div
      data-slot="callout"
      className={cn(calloutVariants({ tone: resolved }), className)}
      {...props}
    >
      {/*
       * `mt-0.5` rather than `items-center`: the glyph aligns to the first line
       * of text, and centring it on a three-line callout parks it beside the
       * middle of the paragraph with nothing to point at.
       */}
      <Icon name={icon ?? TONE_ICONS[resolved]} className="mt-0.5 size-4 shrink-0" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>

      {/*
        The dismiss control, in the callout's own colour.

        ⚠ **`text-current` and `bg-current/10`, never a `Button` variant.** Every
        variant in the button scale pins its own foreground and hover fill —
        `ghost` is `text-secondary-foreground` over `hover:bg-accent` — and on an
        amber or clay callout that paints a grey chip inside a tinted box. Here
        the glyph *is* the tone, dimmed at rest and full-strength under the
        pointer, so one control reads correctly on all three surfaces without
        the component knowing which one it is on.

        The focus ring is the system's, not `current`: an amber ring on an amber
        fill is a ring nobody can see.

        `size-10` is the design system's floor for a control; the negative
        margins claw back the space it would otherwise add to a two-line callout
        so the box does not grow around its own close button.
      */}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="-mt-1.5 -me-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-current/60 transition-colors duration-(--duration-label) ease-(--ease-sweep) hover:bg-current/10 hover:text-current focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-focus-halo focus-visible:outline-none motion-reduce:transition-none"
        >
          <Icon name="close" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export { Callout, calloutVariants };
