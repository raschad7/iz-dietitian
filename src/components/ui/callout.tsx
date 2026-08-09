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
  };

function Callout({ tone, icon, title, className, children, ...props }: CalloutProps) {
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
    </div>
  );
}

export { Callout, calloutVariants };
