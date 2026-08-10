'use client';

import type { ComponentProps } from 'react';
import { Toaster as SonnerToaster, toast } from 'sonner';

import { cn } from '@/lib/utils';

/**
 * The Shadcn notification surface.
 *
 * Sonner owns measurement and stacking. Keeping those mechanics out of the
 * weekly-plan render tree is important: the former Base UI toast measured its
 * animated height synchronously after a drop and could trap Chromium in a
 * resize/update loop, freezing the whole planner after the database write had
 * already succeeded.
 */
function Toaster({ className, ...props }: ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      position="bottom-center"
      visibleToasts={3}
      gap={12}
      className={cn('toaster group', className)}
      toastOptions={{
        classNames: {
          toast:
            'group rounded-lg border border-border bg-popover text-popover-foreground shadow-overlay',
          title: 'text-body-sm font-semibold',
          description: 'text-caption text-muted-foreground',
          actionButton:
            'rounded-[10px] border border-primary bg-card px-3 text-label font-semibold text-secondary-foreground hover:bg-accent-lime hover:text-on-accent',
          cancelButton:
            'rounded-[10px] border border-border bg-card px-3 text-label font-semibold text-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
