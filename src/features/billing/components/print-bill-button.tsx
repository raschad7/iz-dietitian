'use client';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { cn } from '@/lib/utils';

import { ROW_ACTION_CLASS } from './row-action';
import { usePrintBill } from './use-print-bill';

/**
 * A printer that raises the browser's own print dialog, over the page it was
 * pressed on.
 *
 * Both printers on the Bills screen are this: the one on a row prints the whole
 * account, the one in the opened ledger prints a single bill. They differ only
 * in the URL and the words they carry.
 *
 * ## Two shapes
 *
 * A mark in a register row, where four controls share a cell and none of them
 * has width for words. A labelled button wherever there is room — the record's
 * Expenses panel — because an icon alone there is a control somebody has to
 * press to find out what it does, sitting beside two that say what they are.
 *
 * The accessible name is the same either way: it names *which* bill, or whose
 * account, so a screen reader hearing the control out of its row is not left
 * with four identical announcements.
 *
 * ## What a press does
 *
 * The bill is loaded into an off-screen `<iframe>`, and `print()` is called on
 * that frame once it has rendered. What the reader gets is the dialog Ctrl+P
 * gives them anywhere else — their printer, their page settings, and a preview
 * of the bill — over the Bills table, with nothing navigated and no tab opened.
 *
 * `window.print()` would print the Bills table itself, and there is no markup
 * that says "print this other document"; a frame is the only way to aim the
 * browser's dialog at a document the current page is not.
 *
 * ## Fetched, not pointed at — and this is what the deployed bug was
 *
 * The mechanics are `usePrintBill`'s: the PDF is fetched, turned into a blob
 * and loaded into the frame from there. A version of this button pointed the
 * frame straight at the bill's URL instead, on the grounds that the frame sends
 * the session cookie exactly as a navigation would and the fetch was buying
 * little more than a status code. It bought three things, and all three only
 * showed on the deployed server:
 *
 * 1. **The render is not in the frame's time budget.** The give-up timer exists
 *    for a frame that never lays out; pointed straight at the route it was also
 *    timing the server's PDF render, which on a laptop is instant and on the
 *    box this ships to is not. When it fired, the fall-back opened the bill in
 *    a tab — the "it opened twice" half of the report.
 * 2. **A response that is not a PDF has somewhere to go.** A session that
 *    expired mid-shift answers a *redirect to the login form*, with a perfectly
 *    good status on it, and a frame pointed at the route would have printed
 *    that.
 * 3. **A blob is not a navigation**, so nothing between the page and the
 *    document — a service worker, a proxy — is in the way of a print.
 *
 * ## When the browser will not
 *
 * Safari does not raise a print dialog for a PDF in a frame, and a frame that
 * never renders one cannot be talked into it. Every such path — a `print()`
 * that throws, a frame that neither loads nor errors — ends with the bill open
 * in a tab, where the browser's own printing works. The element underneath is
 * an `<a>` carrying the real URL, so a middle-click or a Ctrl/⌘-click still
 * means what it means everywhere else in the browser.
 */
export function PrintBillButton({
  href,
  label,
  hint,
  /** Drawn beside the mark. Given, this is a labelled button; omitted, a mark. */
  text,
  className,
  iconClassName,
}: {
  href: string;
  /** The accessible name — says *which* bill, or whose account. */
  label: string;
  /**
   * The short hover label, without the name — shown in a `TooltipHint`, and
   * only on the icon-only rendering: beside `text`, it would be the words
   * already on the button arriving a second time.
   */
  hint: string;
  text?: string;
  className?: string;
  iconClassName?: string;
}) {
  /*
    The frame, the blob and every way this can fail to raise a dialog, in one
    place — the record's Expenses panel prints through the same hook. See
    `usePrintBill`.
  */
  const { print, pending } = usePrintBill();

  /*
    The tab is the answer to every way the browser will not raise a dialog: a
    `print()` that throws, a frame that neither loads nor errors, a Safari that
    does not print a framed PDF, and a response that turned out to be the login
    form. All of them end here, at the URL the anchor was carrying anyway.

    `window.open` is best-effort: a fetch has happened since the press, so a
    popup blocker that only trusts a live gesture will refuse it and hand back
    `null`. Then the bill takes this tab rather than a new one — leaving the
    Bills page is worse than staying on it, and it is still far better than a
    press with no outcome at all.
  */
  const openInTab = () => {
    if (!window.open(href, '_blank', 'noopener')) window.location.href = href;
  };

  const control = (
    <a
      href={href}
      className={cn(
        text
          ? buttonVariants({ variant: 'outline' })
          : [buttonVariants({ variant: 'ghost', size: 'icon' }), ROW_ACTION_CLASS],
        className,
      )}
      aria-label={label}
      aria-busy={pending || undefined}
      onClick={(event) => {
        /*
          Let the browser have the click when the reader asked for a tab: a
          middle click, Ctrl/⌘, Shift, or Alt. Only the plain left click is
          ours.
        */
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        event.preventDefault();
        void print(href).catch(openInTab);
      }}
    >
      {pending ? (
        <Spinner className={cn(text ? 'size-4' : 'size-5', iconClassName)} />
      ) : (
        <Icon name="printBill" className={cn(text ? 'size-4' : 'size-5', iconClassName)} />
      )}
      {text}
    </a>
  );

  /*
    The hint is a real tooltip rather than the browser's `title`: that one
    waits a second, draws itself in the system's own font at the pointer, and
    on a touch screen never appears at all. `TooltipHint` is the app's own
    surface, positioned against the trigger and flipped when there is no room.

    A labelled button keeps its label and nothing else. See `hint`.
  */
  return text ? control : (
    <TooltipHint label={hint} className="shrink-0">
      {control}
    </TooltipHint>
  );
}
