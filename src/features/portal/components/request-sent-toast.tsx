'use client';

import { useEffect, useRef } from 'react';

import { toast } from '@/components/ui/toast';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * "That went through" — said once, over the page, and then gone.
 *
 * **Why a toast and not the banner this replaces.** The confirmation used to be
 * a panel under the request button, drawn whenever `?sent=1` was in the URL.
 * Nothing ever took it down: the param survives a refresh, a back, and every
 * client-side navigation back to this tab, so a client who asked for an
 * appointment once carried a green bar at the top of their appointments screen
 * for the rest of the session. A confirmation that never leaves stops being a
 * confirmation and becomes furniture — and worse, furniture sitting between the
 * page's own title and the appointment it is about.
 *
 * A toast is the right shape because the message is an *event*: it belongs to
 * the press that caused it, not to the screen it lands on. It says its piece,
 * it is announced, and it takes itself away. The filed request is still on this
 * page underneath — the section it appears in is the durable record, and this
 * is only the receipt.
 *
 * **It clears the param on the way past**, which is what makes "once" true.
 * Without the `replace` the effect would fire again on every remount of this
 * page — every tab switch back to it — because `?sent=1` would still be there
 * asking for it. `replace`, not `push`: a confirmation should not be a place
 * the back button can return to. The bare `pathname` also sweeps up `request`,
 * `date`, `kind` and `appointmentId` from the form that redirected here.
 *
 * The ref guard is for React's development double-invoke, which would otherwise
 * stack two identical toasts before the navigation lands.
 *
 * No live region of its own: `Toaster` renders its viewport as one, so a client
 * arriving here by redirect — with the whole document replaced under them —
 * hears the sentence rather than only the new page.
 */
export function RequestSentToast({ title, description }: { title: string; description: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    toast.success(title, { description });
    router.replace(pathname, { scroll: false });
  }, [title, description, pathname, router]);

  return null;
}
