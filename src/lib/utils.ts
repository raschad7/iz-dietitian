import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `cn`, taught the app's own type scale.
 *
 * tailwind-merge only knows Tailwind's stock font sizes. Everything else it
 * sees as `text-<something>` is filed as a *colour*, so `text-caption` and
 * `text-muted-foreground` looked like the same property and the second one
 * silently deleted the first — a caption rendered at 14px, and an avatar's
 * `text-white` disappeared behind `text-label`. Registering the scale here is
 * what makes size and colour independent again.
 *
 * The names are the ones declared in `globals.css`; `text-xs`/`text-sm` are
 * already stock and stay where they are.
 *
 * The same blind spot applies to the green-tinted shadow ramp. tailwind-merge
 * knows `shadow-none` and the stock t-shirt sizes, so it filed `shadow-card`
 * as something else entirely and let the two coexist — `cn('shadow-card',
 * 'shadow-none')` emitted both, and which one won was down to the order
 * Tailwind happened to sort them into rather than to the call site. Registering
 * the ramp here is what makes "this surface carries no shadow" actually
 * removable at the call site. Add any new shadow token to this list as well as
 * to `globals.css`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-lg",
            "display-sm",
            "heading-lg",
            "heading-sm",
            "body-lg",
            "body-md",
            "body-sm",
            "label",
            "caption",
          ],
        },
      ],
      shadow: [{ shadow: ["card", "elevated", "overlay"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
