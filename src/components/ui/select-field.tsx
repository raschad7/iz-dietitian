import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A native `<select>` with a chevron this app controls.
 *
 * Chrome pins the native dropdown arrow to the border and ignores
 * `padding-right`/`padding-inline-end` on a `<select>`, so any attempt to give
 * the value room to breathe is silently dropped and long option text runs into
 * the arrow. The fix is `appearance: none` plus an arrow we draw ourselves —
 * done once, here, rather than as a class string copied around the feature.
 *
 * Still a real `<select>`: keyboard behaviour, screen-reader semantics and the
 * mobile native picker all come for free, and there is no client bundle. The
 * chevron is positioned with `inset-inline-end` and the padding with `pe-*`, so
 * it mirrors in Arabic without a direction prop.
 *
 * The existing `@/components/ui/select` primitive keeps the browser's own arrow;
 * this is the variant to reach for wherever spacing matters.
 */
function SelectField({
  className,
  children,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select-field"
        className={cn(
          // Shape: "the Arc" (§9.3) — 10px base radius, 24px sweep on the block-end/inline-end corner.
          'q-field-arc h-9 w-full appearance-none rounded-[10px] rounded-ee-xl border border-input bg-transparent ps-3 pe-9 py-1 text-sm',
          'transition-all duration-220 ease-[cubic-bezier(.2,.6,.2,1)] outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-field-focus-halo',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
          'dark:bg-input/30',
          className,
        )}
        {...props}
      >
        {children}
      </select>

      {/*
        `pointer-events-none` so clicking the chevron still opens the select —
        the icon sits on top of the control that owns the interaction.
      */}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { SelectField };
