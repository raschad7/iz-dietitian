'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Icon, type IconName } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/utils';

/**
 * The settings surface: one animated tab bar, and one panel whose contents
 * cross-fade as you move between tabs.
 *
 * ## It stays on one page
 *
 * Settings used to be four routes under one layout, so every tab was a
 * navigation: the server re-ran, the panel blanked and repainted, and the tab
 * bar had no way to animate across a page boundary. The four data loads happen
 * once now, on the server, and each section's already-rendered tree is handed
 * in as a `content` node. Switching a tab changes React state, not the route —
 * so nothing remounts but the panel, and the switch is a single continuous
 * gesture rather than a page swap.
 *
 * The address bar is still kept honest: `?section=` is written with a shallow
 * `history.replaceState`, so a refresh or a shared link reopens the same tab
 * without any of the tabs being a real route. `replaceState`, not `pushState` —
 * turning to another tab is not a place, and stacking every switch onto history
 * would turn Back into a walk through them.
 *
 * ## The two animations
 *
 * The tab bar is `Segmented shape="pill"`, the same control the sign-in screen
 * uses for its role switch: a raised card that slides between segments. The
 * panel borrows the sign-in card's crossfade — the outgoing section fades down
 * a few pixels, is swapped while it is invisible, and the incoming one rises
 * into place. `active` is where the bar is going and drives the thumb at once;
 * `shown` is what the panel is rendering and lags by exactly one fade, so what
 * you see swap is always a panel that is already blank.
 */

export type SettingsSectionDef = {
  key: string;
  label: string;
  icon: IconName;
  content: ReactNode;
};

/**
 * ms to hold the panel faded-out before swapping what is inside it. **Mirrors
 * `--duration-reverse`** in globals.css, the speed the fade runs *out* at — the
 * CSS takes the panel down and this decides when it is safe to replace, so the
 * two must agree or the incoming section appears over the outgoing one.
 */
const CROSSFADE_MS = 140;

export function SettingsWorkspace({
  label,
  sections,
  initialSection,
}: {
  label: string;
  sections: readonly SettingsSectionDef[];
  initialSection: string;
}) {
  const firstKey = sections[0]?.key ?? '';
  const start = sections.some((section) => section.key === initialSection)
    ? initialSection
    : firstKey;

  /*
   * Two copies of the same key. `active` is where the bar is heading and moves
   * the thumb immediately; `shown` is what the panel renders and lags by one
   * fade. While they disagree the panel is faded out, so the swap happens on an
   * empty panel rather than under the reader's eye.
   */
  const [active, setActive] = useState(start);
  const [shown, setShown] = useState(start);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * `goTo` needs the current tab without reading it out of a `setActive`
   * updater — scheduling the swap timer in there would make the updater impure,
   * and React runs updaters twice in development to catch exactly that. The ref
   * is written from the event handler, never during a render.
   */
  const activeRef = useRef(start);

  useEffect(
    () => () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
    },
    [],
  );

  const goTo = useCallback((key: string) => {
    if (key === activeRef.current) return;
    activeRef.current = key;
    setActive(key);

    /*
     * Point `?section=` at the new tab without navigating. `replaceState` is
     * shallow — nothing remounts, nothing typed into an open dialog is lost —
     * and Next reads `usePathname`/search from it, so a refresh reopens here.
     */
    const url = new URL(window.location.href);
    url.searchParams.set('section', key);
    window.history.replaceState(null, '', url);

    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => setShown(key), instant ? 0 : CROSSFADE_MS);
  }, []);

  const visible = active === shown;
  const shownSection = sections.find((section) => section.key === shown) ?? sections[0];

  /*
   * The panel's fade — out fast, in a shade slower, so a section always arrives
   * the same way. The 4px of travel is vertical on purpose: a horizontal slide
   * would have to pick a direction, and the reading direction inverts between
   * Arabic and English. Vertical reads the same in both scripts.
   */
  const fade = cn(
    'transition-[opacity,translate] ease-(--ease-sweep) motion-reduce:transition-none motion-reduce:translate-y-0',
    visible
      ? 'translate-y-0 opacity-100 duration-(--duration-label)'
      : 'translate-y-1 opacity-0 duration-(--duration-reverse)',
  );

  return (
    <div className="flex w-full flex-col gap-5">
      <Segmented
        role="tablist"
        shape="pill"
        label={label}
        value={active}
        onChange={goTo}
        options={sections.map((section) => ({
          value: section.key,
          label: (
            <span className="inline-flex items-center gap-2">
              {/* A touch larger while it is carrying the tab on its own below
                  `sm`, back to the row's 17px once the label is beside it. */}
              <Icon name={section.icon} className="size-5 sm:size-[17px]" />
              <span className="sr-only sm:not-sr-only">{section.label}</span>
            </span>
          ),
        }))}
      />

      {/*
        The panel. The wrapper persists so its opacity can transition; only its
        children swap, and they swap while it is invisible. `role="tabpanel"`
        names it for a screen reader as the region the tab controls.
      */}
      <div role="tabpanel" aria-label={shownSection?.label} className={fade}>
        {shownSection?.content}
      </div>
    </div>
  );
}
