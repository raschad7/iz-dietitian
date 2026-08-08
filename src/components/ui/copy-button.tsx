'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';

/**
 * Copies one value to the clipboard.
 *
 * A phone number, an email address, a username, a one-time password: four
 * places on a client's record hold a string whose only purpose is to be pasted
 * somewhere else, and every one of them was being selected by hand. The
 * temporary password is the case that matters most — it is shown exactly once,
 * never stored in plaintext, and "select the text carefully before you navigate
 * away" is a poor thing to ask of the one value that cannot be recovered.
 *
 * **The confirmation is a glyph swap and a live region, not a toast.** The
 * design system has no toast, and inventing one for this would be a lot of
 * furniture for a message that means "yes, that worked". The check mark reverts
 * on its own; the `role="status"` text is what a screen reader hears, and it is
 * the only part that is announced.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  size = 'icon-sm',
  className,
}: {
  value: string;
  /** What is being copied — the accessible name and the tooltip. */
  label: string;
  /** Announced after a successful copy. */
  copiedLabel: string;
  size?: 'icon' | 'icon-sm';
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  /*
   * Cleared on unmount as well as on the timer, so a row that is removed while
   * the check mark is still showing does not set state on a gone component.
   */
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      /*
       * Denied permission, or an insecure origin. Deliberately silent: the
       * value is still on screen and still selectable, so the fallback is the
       * behaviour that existed before this button did. An error toast for "you
       * will have to select it yourself" is worse than nothing.
       */
    }
  }

  return (
    <>
      <Tooltip label={copied ? copiedLabel : label}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          aria-label={label}
          onClick={copy}
          className={className}
        >
          {/*
            The glyph swaps but the button does not resize — both are `size-4`
            inside a fixed square, so a row of values does not shift sideways
            when one of them is copied.
          */}
          <Icon name={copied ? 'check' : 'copy'} className="size-4" />
        </Button>
      </Tooltip>

      <span role="status" aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ''}
      </span>
    </>
  );
}
