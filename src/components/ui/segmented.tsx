'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A segmented control: two to four mutually exclusive options, all visible.
 *
 * Two screens were hand-rolling this with the same markup and nearly the same
 * classes — the calendar's day/week/month switch and the login role switch —
 * which is how a design system drifts.
 *
 * ## Semantics
 *
 * `role` is a prop rather than a fixed value because the two callers mean
 * different things. The calendar switches which *view* of the same page is
 * shown, which is a tablist. The login switch picks which *form* to fill in,
 * which is a radio group. Announcing either as the other misleads a screen
 * reader, and the visual treatment is identical, so the choice belongs to the
 * caller.
 *
 * ## Shape
 *
 * The track carries the Arc; the thumb does not. One tail per surface — a
 * swept thumb sliding inside a swept track would be two tails arguing. The
 * thumb moves by re-tinting rather than by translating a shared element,
 * because the options are not a fixed width in two languages and an animated
 * offset would need measuring on every locale change.
 */
type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  role = 'tablist',
  size = 'default',
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for a screen reader, e.g. "Calendar view". */
  label: string;
  role?: 'tablist' | 'radiogroup';
  size?: 'default' | 'sm';
  className?: string;
}) {
  const isTablist = role === 'tablist';

  return (
    <div
      role={role}
      aria-label={label}
      className={cn(
        'inline-flex rounded-lg rounded-ee-xl border border-border p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role={isTablist ? 'tab' : 'radio'}
            aria-selected={isTablist ? active : undefined}
            aria-checked={isTablist ? undefined : active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-md font-medium transition-colors duration-180',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-focus-halo focus-visible:outline-none',
              size === 'sm' ? 'px-2.5 py-1 text-caption' : 'px-3 py-2 text-body-md',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { Segmented, type SegmentedOption };
