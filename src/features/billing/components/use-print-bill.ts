'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Printing a bill without leaving the screen.
 *
 * Pressing a printer here does what Ctrl+P does: the browser's own print dialog
 * opens over the Bills table, with the bill in the preview. No tab is opened
 * and nothing navigates — the reader stays exactly where they were, on the page
 * and the filter they were working through.
 *
 * ## How
 *
 * The PDF is fetched, turned into a blob URL, and loaded into an off-screen
 * `<iframe>`; once it has rendered, `contentWindow.print()` raises the dialog
 * against that frame. This is the only way to reach the browser's print dialog
 * for a document the current page is not: `window.print()` prints the Bills
 * table itself, and a `<link rel="print">` does not exist.
 *
 * **Fetched rather than pointed at.** Setting the iframe's `src` to the route
 * directly would work, but a failure then has nowhere to go — a 404 or a
 * session that expired mid-shift would render an error page inside a hidden
 * frame and print *that*. Fetching first means the response can be checked
 * before anything is shown, and the caller gets a real error instead.
 *
 * ## Why the frame is off-screen rather than `display: none`
 *
 * A frame that is not displayed is not laid out, and a PDF viewer inside one
 * may never finish rendering — so `print()` fires against a blank page. Moving
 * it out of view keeps it a real, laid-out frame that nobody can see.
 *
 * ## What is deliberately not handled
 *
 * Safari does not raise a print dialog for a PDF in a frame. Callers keep the
 * bill's URL on the anchor they attach this to, so a modifier-click still opens
 * it in a tab, and {@link PrintFailure} tells a caller when to fall back.
 */

/** Why a print did not happen, for the caller's message. */
export type PrintFailure = 'unavailable' | 'failed';

export function usePrintBill(): {
  /** Prints the document at `url`. Rejects with a {@link PrintFailure}. */
  print: (url: string) => Promise<void>;
  /** True while one is being fetched — for the button's spinner. */
  pending: boolean;
} {
  const [pending, setPending] = useState(false);

  /*
    Every frame and object URL this hook has made, so an unmount in the middle
    of a print — a filter changed, a page turned — does not leave a detached
    frame holding a blob alive for the life of the tab.
  */
  const cleanups = useRef<(() => void)[]>([]);

  useEffect(() => {
    const pending = cleanups.current;
    return () => {
      for (const clean of pending) clean();
      pending.length = 0;
    };
  }, []);

  const print = useCallback(async (url: string) => {
    setPending(true);

    try {
      /* `same-origin` credentials: the routes are behind the staff session. */
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`bill request failed: ${response.status}`);

      /*
        A 200 is not proof of a bill.

        A session that expired mid-shift does not answer 401 here: the proxy
        redirects to the sign-in page, `fetch` follows it, and what arrives is
        an HTML login form with a perfectly good status on it. Printed, that is
        a sheet of paper with a password field on it; blobbed into the frame
        below it is worse, because it looks like the print simply did nothing.

        So the type is checked, and anything that is not a PDF is treated as a
        document the browser should show rather than one this hook should
        print — which lands the reader on the login page they actually need.
      */
      const type = response.headers.get('content-type') ?? '';

      if (!type.toLowerCase().includes('application/pdf')) {
        throw 'unavailable' satisfies PrintFailure;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      /*
        Off-screen, not hidden — see the note above — and a page's worth of it.

        A 1px frame is laid out, which is what the note is about, but it is not
        laid out *around a document*: a PDF viewer given a box that small has
        nothing to paginate and can sit there without ever finishing. The size
        is a sheet of paper at screen scale, so the viewer does the work it
        would do if the frame were visible.
      */
      frame.style.cssText =
        'position:fixed;inset-inline-start:-10000px;top:0;width:900px;height:1200px;opacity:0;border:0';

      let done = false;
      /*
        The give-up timer below, held here so `clean` can cancel it. Every way
        out of this print goes through `clean`, so this is the one place that
        has to know about the timer — a timer cleared at each exit instead would
        be one more thing for a new exit to forget.
      */
      let gaveUp = 0;

      const clean = () => {
        if (done) return;
        done = true;
        window.clearTimeout(gaveUp);
        URL.revokeObjectURL(objectUrl);
        frame.remove();
        cleanups.current = cleanups.current.filter((entry) => entry !== clean);
      };

      cleanups.current.push(clean);

      await new Promise<void>((resolve, reject) => {
        frame.addEventListener('load', () => {
          const win = frame.contentWindow;

          /*
            The frame's *own* first document, not the bill.

            An `<iframe>` put into the page fires `load` for the `about:blank`
            it starts life with, before whatever it was pointed at has arrived.
            That document is same-origin and perfectly printable, so nothing
            below would have refused it: what came out of the printer was one
            blank sheet carrying the *host page's* URL and title in the header,
            because `about:blank` inherits both — which is exactly the sheet
            this bug was reported with.

            Setting `src` before the frame is appended (see the bottom of this
            promise) is what stops the event being fired at all, and this is the
            second lock on the same door: an engine that fires it anyway, or
            fires it late, gets ignored rather than printed. The real document
            is the blob, and nothing else is worth raising a dialog over.
          */
          if (!win) return;

          let loaded = '';
          /* Reading `location` across origins throws; a blob is same-origin, so
             a throw here means this is not the document being waited for and
             the print goes ahead on the engine's own terms rather than being
             blocked by a check that could not answer. */
          try {
            loaded = win.location.href;
          } catch {
            loaded = '';
          }

          if (loaded === 'about:blank') return;

          /*
            The document is here, so the wait below is over — but the frame
            stays until the dialog closes, which is `clean`'s job and not this
            timer's.
          */
          window.clearTimeout(gaveUp);

          if (typeof win.print !== 'function') {
            clean();
            reject('unavailable' satisfies PrintFailure);
            return;
          }

          win.focus();

          /*
            A beat after `load`. The event fires when the frame's document is in
            place, which for a PDF is the *viewer*, not the rendered page —
            printing on the same tick catches Chrome's viewer before it has laid
            the document out, and raises a dialog over a blank preview. A
            frame's worth of delay is enough, and is what the print libraries
            that solved this before settled on.

            Everything that follows the press lives inside this callback,
            including the promise's own outcome: a `print()` that throws has to
            reject the call the reader is waiting on, and it cannot do that from
            a timer the promise already resolved past.
          */
          window.setTimeout(() => {
            try {
              win.print();
            } catch {
              /*
                `unavailable`, not `failed`.

                A browser that refuses to raise a dialog for a PDF it does not
                own is the case the caller already handles by opening the
                document in a tab, where the browser's own Ctrl+P works. It was
                reported as `failed` — a toast saying to try again, when trying
                again could only produce the same refusal — which is a dead end
                on a screen that has a working way out.

                The `typeof win.print` test above catches only the browsers
                honest enough not to expose the method; the rest expose it and
                throw, or expose it and do nothing.
              */
              clean();
              reject('unavailable' satisfies PrintFailure);
              return;
            }

            resolve();

            /*
              The dialog is modal and synchronous in most browsers, so the frame
              can go as soon as it closes. `afterprint` is the signal when the
              browser sends one; the timer is the backstop for the PDF viewers
              that do not, and 60s is long enough for someone to pick a printer
              and short enough that a blob is not held for the session.
            */
            win.addEventListener('afterprint', clean, { once: true });
            window.setTimeout(clean, 60_000);
          }, 100);
        });

        frame.addEventListener('error', () => {
          clean();
          reject('failed' satisfies PrintFailure);
        });

        /*
          A frame that neither loads nor errors ends the wait itself.

          A PDF viewer that never finishes laying out — an extension that is
          disabled, a viewer replaced by a download handler — fires neither
          event, and the promise above simply never settles: the spinner spins
          for the rest of the session and the press has no outcome at all. Ten
          seconds is far longer than a local blob takes and short enough that
          nobody is left watching it; the answer is the tab the anchor would
          have opened.
        */
        gaveUp = window.setTimeout(() => {
          clean();
          reject('unavailable' satisfies PrintFailure);
        }, 10_000);

        /*
          Pointed at the bill *before* it is put in the page, and the order is
          the fix rather than a tidiness.

          A frame appended with no `src` has already begun loading `about:blank`
          by the time the next line runs, and the `load` for it is queued.
          Assigning first means the frame has exactly one document to load and
          exactly one `load` to fire — the bill's.
        */
        frame.src = objectUrl;
        document.body.append(frame);
      });
    } catch (error) {
      throw typeof error === 'string' ? error : ('failed' satisfies PrintFailure);
    } finally {
      setPending(false);
    }
  }, []);

  return { print, pending };
}
