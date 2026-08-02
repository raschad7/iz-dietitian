import * as React from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * Groups a label with its control.
 *
 * Two things need the grouping. The label's colour shift on focus is driven by
 * `:focus-within` on this element (see `.q-label` in globals.css), and error
 * text needs somewhere to live that is reliably adjacent to the field it
 * describes rather than floating in whatever `space-y-*` the caller happened
 * to use.
 */
function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="field" className={cn('q-field-group space-y-1.5', className)} {...props} />
  );
}

/**
 * The message under a field that failed validation.
 *
 * Entrance is an opacity fade, never a shake: a shake reads as the interface
 * being annoyed, and this is a person mistyping a phone number.
 *
 * `role="alert"` announces it once when it appears. Validation is expected to
 * run on blur rather than per keystroke — a message that arrives while
 * someone is still typing the value is describing a half-finished input.
 */
function FieldError({ className, children, ...props }: React.ComponentProps<'p'>) {
  if (!children) return null;

  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn(
        'flex items-center gap-1.5 text-caption text-destructive',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200',
        className,
      )}
      {...props}
    >
      <Icon name="attention" className="size-3.5" />
      <span>{children}</span>
    </p>
  );
}

/** Helper text. Reference it from the field with `aria-describedby`. */
function FieldHint({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-hint"
      className={cn('text-caption text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Field, FieldError, FieldHint };
