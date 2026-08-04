'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';

/**
 * Tailwind's `xl`, as a media query.
 *
 * The number is repeated here rather than derived, because the class that hides
 * the fixed rail (`xl:flex`) and the query that decides whether to open the
 * sheet have to agree, and a mismatch is the failure mode below.
 */
const XL = '(min-width: 80rem)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(XL);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Whether the viewport is too narrow to spare 300px for the rail.
 *
 * A live subscription rather than a check inside the click handler: the sheet
 * has to close itself when a window widens past `xl`, or the board is left with
 * a modal it can no longer see.
 *
 * The server snapshot is `false` — assume the wide layout — so the first paint
 * is the fixed rail and the sheet is shut. Nothing is opened before hydration
 * anyway; the sheet only ever opens from a click.
 */
export function useBelowXl(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => !window.matchMedia(XL).matches,
    () => false,
  );
}

/**
 * The rail, on a screen too narrow to spare 300px for it.
 *
 * Wraps `Dialog` rather than inventing a sheet: `<dialog>` gives focus
 * trapping, the inert background and Escape for free, and its mobile form is
 * already a bottom sheet.
 *
 * **The breakpoint is decided in JavaScript and not only in CSS.** `xl:hidden`
 * alone would be a trap: `showModal()` puts the dialog in the top layer and
 * marks the rest of the document "blocked by a modal dialog" regardless of
 * whether the dialog itself renders, so a `display: none` modal leaves a wide
 * screen inert — every control dead, focus nowhere, and no visible surface to
 * press Escape from. So the modal is only ever opened below `xl`; the class
 * stays as a second line of defence and to keep the first paint honest.
 */
export function BoardSheet({
  open,
  onClose,
  label,
  closeLabel,
  dir,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  closeLabel: string;
  dir: 'rtl' | 'ltr';
  children: React.ReactNode;
}) {
  const belowXl = useBelowXl();

  return (
    <Dialog
      open={open && belowXl}
      onClose={onClose}
      label={label}
      dir={dir}
      className="max-h-[85dvh] sm:h-full sm:max-h-none xl:hidden"
    >
      <div className="flex h-full min-h-0 flex-col p-4">
        {/* A sheet with no visible way out is a trap on a touch screen, where
            there is no Escape key and the backdrop above a bottom sheet is a
            thin strip. */}
        <div className="flex shrink-0 justify-end pb-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <Icon name="close" />
          </Button>
        </div>

        {children}
      </div>
    </Dialog>
  );
}
