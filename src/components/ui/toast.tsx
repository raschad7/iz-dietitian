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
      gap={10}
      className={cn('toaster group', className)}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'group/toast flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3.5 text-foreground shadow-elevated',
          content: 'min-w-0 flex-1',
          icon: 'grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary [&>svg]:size-4',
          title: 'text-body-sm font-semibold leading-5',
          description: 'mt-0.5 text-caption leading-5 text-muted-foreground',
          error:
            '[&_[data-icon]]:bg-destructive-subtle [&_[data-icon]]:text-destructive',
          warning:
            '[&_[data-icon]]:bg-status-attention-bg [&_[data-icon]]:text-status-attention-fg',
          actionButton:
            'ms-auto inline-flex h-8 shrink-0 items-center rounded-[10px] border border-primary bg-card px-3 text-label font-semibold text-secondary-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          cancelButton:
            'ms-auto inline-flex h-8 shrink-0 items-center rounded-[10px] border border-border bg-card px-3 text-label font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
