'use client';

import { useEffect, useRef, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { cn } from '@/lib/utils';

import { ROW_ACTION_CLASS } from './row-action';

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
 * ## Pointed at, not fetched
 *
 * The frame's `src` is the bill's own URL. An earlier version fetched the PDF
 * first, turned it into a blob and pointed the frame at that — to be able to
 * check the response before showing it — and paid for the check with a hundred
 * lines of blob and cleanup bookkeeping, plus a failure mode per step. The
 * frame sends the session cookie exactly as a navigation would, so the fetch
 * was buying a status code and little else.
 *
 * ## Why the frame is off-screen rather than `display: none`
 *
 * A frame that is not displayed is not laid out, and a PDF viewer inside one
 * may never finish rendering — so `print()` fires against a blank page. Moving
 * it out of view keeps it a real, laid-out frame that nobody can see.
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
  /* The beat between the press and the dialog: a bill is a render, not a file
     on disk, and a printer that looks inert for a second gets pressed twice. */
  const [pending, setPending] = useState(false);

  /*
    Every frame this button has made, so leaving the screen mid-print — a filter
    changed, a page turned — does not leave one behind for the life of the tab.
  */
  const frames = useRef<(() => void)[]>([]);

  useEffect(() => {
    const made = frames.current;
    return () => {
      for (const clean of made) clean();
      made.length = 0;
    };
  }, []);

  const print = () => {
    setPending(true);

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    /* Off-screen, not hidden — see the note above. */
    frame.style.cssText = 'position:fixed;inset-inline-start:-10000px;top:0;width:900px;height:1200px;opacity:0;border:0';

    let done = false;
    let gaveUp = 0;

    const clean = () => {
      if (done) return;
      done = true;
      window.clearTimeout(gaveUp);
      frame.remove();
      frames.current = frames.current.filter((entry) => entry !== clean);
    };

    frames.current.push(clean);

    /* The tab is the answer to every way this can fail to raise a dialog. */
    const fallBack = () => {
      clean();
      setPending(false);
      window.open(href, '_blank', 'noopener');
    };

    frame.addEventListener('load', () => {
      window.clearTimeout(gaveUp);

      const win = frame.contentWindow;

      if (!win || typeof win.print !== 'function') {
        fallBack();
        return;
      }

      /*
        A beat after `load`. The event fires when the frame's document is in
        place, which for a PDF is the *viewer*, not the rendered page — printing
        on the same tick catches it before it has laid the document out, and
        raises a dialog over a blank preview.
      */
      window.setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          fallBack();
          return;
        }

        setPending(false);

        /*
          The dialog is modal and synchronous in most browsers, so the frame can
          go as soon as it closes. `afterprint` is the signal when the browser
          sends one; the timer is the backstop for the viewers that do not, and
          60s is long enough to pick a printer.
        */
        win.addEventListener('afterprint', clean, { once: true });
        window.setTimeout(clean, 60_000);
      }, 150);
    });

    frame.addEventListener('error', fallBack);

    /*
      A frame that neither loads nor errors ends the wait itself: a viewer
      replaced by a download handler fires neither event, and without this the
      spinner would spin for the rest of the session.
    */
    gaveUp = window.setTimeout(fallBack, 10_000);

    document.body.append(frame);
    frame.src = href;
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
        print();
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
