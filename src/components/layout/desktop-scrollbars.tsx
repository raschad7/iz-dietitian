"use client";

import { useEffect } from "react";

/**
 * The rules in `globals.css` decide whether a bar is drawn; only the engine
 * knows how wide it ends up. `--scrollbar-size` is the width *asked* for, and
 * the width *taken* is that value snapped to whole device pixels — 14px on a
 * 1.25x display is 17.5 device pixels, and no engine draws half of one. A
 * platform that ignores the `::-webkit-` block, Firefox above all, picks its
 * own number entirely.
 *
 * `.q-scroll-cue-inset` needs the width that was taken, near enough to the
 * pixel: it brings the cue's edge shadow in by that much, to the last column of
 * pixels the masking wedge can still be painted over. Three pixels short and
 * three pixels of shadow stand outside the wedge, down the edge of every Arabic
 * table — the hairline the whole correction exists to remove. So the bar is
 * measured rather than assumed: one off-screen scroller, inside the scope class
 * so the same rules reach it, read once per layout that can change the answer.
 */
function measureScrollbar(): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;top:-9999px;inline-size:100px;block-size:100px;overflow-y:scroll";
  document.body.append(probe);
  const width = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return width;
}

/** The two conditions the bar is drawn under — see `globals.css`. */
const DESKTOP_BARS = "(width >= 64rem) and (pointer: fine)";

/**
 * Puts the desktop scrollbar's scope class on `<html>` while the staff app is
 * mounted.
 *
 * The class started on `AppShell`, which was the wrong element for half of what
 * it has to reach: a dialog, a sheet and every popup are portalled to
 * `document.body`, outside the shell's subtree entirely, so the intake record
 * and the dish catalog drawer — the two longest scrolling surfaces in the
 * product — were exactly the ones a shell-scoped rule could not see. `<html>`
 * is the only ancestor all of them share.
 *
 * It cannot be written into the server-rendered markup: `<html>` is the root
 * locale layout's element and the staff app is three layouts below it, so
 * nothing on the staff side can add an attribute to it without making the whole
 * tree dynamic. An effect is the seam, and the cost is one frame of a page with
 * no bar — which is invisible next to the round trip that rendered it.
 *
 * The cleanup is what keeps the portal clean. A client is a different route
 * tree, so this unmounts on the way there and the class goes with it; without
 * the removal a staff user who followed a link into the portal would carry the
 * staff app's bars into a surface whose palette they were never tuned for.
 *
 * Rendered from the staff layout only. See "The desktop scrollbar" in
 * `globals.css` for the rules this switches on, and for the two media
 * conditions that decide whether they apply at all.
 */
export function DesktopScrollbars() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("q-desk-scrollbars");

    /* Measured after the class is on, or the probe is read under the base
       layer's hidden bars and every scroller in the app is told there is no
       bar to correct for. */
    const publish = () => {
      root.style.setProperty("--scroll-cue-bar", `${measureScrollbar()}px`);
    };

    publish();

    /* Crossing either condition turns the bar on or off, which changes the
       answer. Nothing else does — the width is a property of the engine and
       the display, not of the page. */
    const query = window.matchMedia(DESKTOP_BARS);
    query.addEventListener("change", publish);

    return () => {
      query.removeEventListener("change", publish);
      root.style.removeProperty("--scroll-cue-bar");
      root.classList.remove("q-desk-scrollbars");
    };
  }, []);

  return null;
}
