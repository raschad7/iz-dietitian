"use client";

import { useEffect } from "react";

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
    return () => root.classList.remove("q-desk-scrollbars");
  }, []);

  return null;
}
