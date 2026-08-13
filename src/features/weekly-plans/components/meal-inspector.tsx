'use client';

import * as React from 'react';
import { Popover } from '@base-ui/react/popover';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import { preferredInspectorSide, type InspectorSide } from '../meal-inspector-position';
import type { BoardMeal, CatalogEntry, SwapCandidate } from '../queries';
import { PLANNER_THEME } from '../theme';
import type { RecentUse } from '../usage';

import { MealCardSnapshot } from './meal-card';
import { MealDetailPanel } from './meal-detail-panel';

type AnchorSnapshot = {
  insetBlockStart: number;
  insetInlineStart: number;
  width: number;
  height: number;
};

/** The meal and the card it was opened from, held together so neither can go missing. */
type Inspected = { meal: BoardMeal; anchor: HTMLButtonElement };

export function MealInspector({
  meal,
  anchor,
  candidates,
  catalog,
  usage,
  planId,
  locale,
  editable,
  model,
  onClose,
  onBrowseDishes,
}: {
  meal: BoardMeal | undefined;
  anchor: HTMLButtonElement | null;
  candidates: readonly SwapCandidate[];
  catalog: readonly CatalogEntry[];
  usage: Record<string, RecentUse>;
  planId: string;
  locale: string;
  editable: boolean;
  model?: string | null;
  onClose: () => void;
  onBrowseDishes: () => void;
}) {
  const t = useTranslations('weeklyPlans');
  const [side, setSide] = React.useState<InspectorSide>('left');
  const [snapshot, setSnapshot] = React.useState<AnchorSnapshot | null>(null);

  const open = Boolean(meal && anchor);

  /*
   * What the panel is showing, kept for as long as it is on screen — which
   * includes the whole of its closing transition.
   *
   * **The popup element may not disappear in the commit that closes the
   * popover.** Base UI unmounts a popover's portal only once the popup finishes
   * animating out: `useOpenStateTransitions` waits on `useOpenChangeComplete`,
   * which watches the popup ref, and `useAnimationsFinished` returns *without
   * ever calling back* when that ref is already `null`. Render the popup on the
   * same condition that drives `open` and React detaches it in the very commit
   * that starts the close, the completion callback never fires, the portal
   * stays mounted forever — and `Popover.Backdrop`, a `fixed inset-0` element
   * that has already faded to `opacity: 0`, sits invisibly over the whole page
   * swallowing every click until the tab is reloaded.
   *
   * That is not a corner case. It is every close driven by the board's data
   * rather than by the popover itself: replacing a meal, clearing or removing
   * one, or jumping from here to the dish catalog all make `meal` undefined,
   * and the panel closing that way is precisely when the board went dead.
   *
   * Holding the last pair means the popup outlives the meal by one transition,
   * with something real to draw while it fades.
   *
   * State rather than a ref, and adjusted during render rather than in an
   * effect: the popup has to render *this* pass with the meal it is closing on,
   * and an effect would give it one frame of nothing first.
   */
  const [inspected, setInspected] = React.useState<Inspected | null>(null);

  if (meal && anchor && (inspected?.meal !== meal || inspected.anchor !== anchor)) {
    setInspected({ meal, anchor });
  }

  /*
   * The anchor's last box, and a stand-in that reports it.
   *
   * A meal removed from the panel takes its card out of the DOM with it, and a
   * detached element measures as a zero-sized box at the viewport origin —
   * enough to fling the closing panel into the corner on its way out. So the
   * positioner follows the live card only while the panel is open, and falls
   * back to the last box it measured for the length of the close. Created once,
   * so what the positioner receives is a stable reference rather than a new
   * object every render.
   */
  const lastRectRef = React.useRef<DOMRect | null>(null);
  const [lastAnchorBox] = React.useState(() => ({
    getBoundingClientRect: () => lastRectRef.current ?? new DOMRect(),
  }));

  React.useLayoutEffect(() => {
    if (!open || !anchor) {
      return;
    }
    const activeAnchor = anchor;

    function measure() {
      const rect = activeAnchor.getBoundingClientRect();
      const direction = getComputedStyle(activeAnchor).direction;

      lastRectRef.current = rect;
      setSide(preferredInspectorSide(rect, window.innerWidth, window.innerHeight));
      setSnapshot({
        insetBlockStart: rect.top,
        insetInlineStart: direction === 'rtl' ? window.innerWidth - rect.right : rect.left,
        width: rect.width,
        height: rect.height,
      });
    }

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(activeAnchor);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor, open]);

  function close(): void {
    onClose();
    // Only back to a card that is still there. A meal removed from this panel
    // takes its anchor with it, and focusing a detached node drops focus to the
    // body without the board ever knowing where the reader was.
    window.requestAnimationFrame(() => {
      if (anchor?.isConnected) anchor.focus();
    });
  }

  return (
    <Popover.Root
      open={open}
      modal="trap-focus"
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <Popover.Portal>
        <Popover.Backdrop
          className={cn(
            'fixed inset-0 z-40 bg-[var(--scrim)] [backdrop-filter:blur(4px)]',
            'transition-opacity duration-(--duration-sweep) ease-(--ease-sweep)',
            'data-ending-style:opacity-0 data-starting-style:opacity-0',
            // A scrim on its way out takes no clicks. It is invisible from the
            // first frame of the transition, so it has nothing left to be
            // pressed *for* — and if it is ever stranded there again, an
            // invisible sheet over the board is the difference between a stray
            // element and an application nobody can use.
            'data-ending-style:pointer-events-none',
          )}
        />

        {inspected && snapshot && (
          <div
            aria-hidden
            className={cn(PLANNER_THEME, 'pointer-events-none fixed z-50 max-sm:hidden')}
            style={snapshot}
          >
            <MealCardSnapshot meal={inspected.meal} />
          </div>
        )}

        {inspected && (
          <Popover.Positioner
            anchor={open && anchor ? anchor : lastAnchorBox}
            positionMethod="fixed"
            side={side}
            align="center"
            sideOffset={16}
            collisionPadding={16}
            collisionAvoidance={{ side: 'flip', align: 'shift', fallbackAxisSide: 'start' }}
            className="isolate z-50 max-sm:!inset-x-0 max-sm:!bottom-0 max-sm:!top-auto max-sm:!transform-none"
          >
            <Popover.Popup
              className={cn(
                PLANNER_THEME,
                'relative flex h-[min(44rem,calc(100vh-2rem))] w-[min(29rem,calc(100vw-1.5rem))] origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-overlay ring-1 ring-foreground/10 outline-none max-sm:h-[min(44rem,calc(100vh-1rem))] max-sm:w-full max-sm:rounded-b-none',
                'transition-[opacity,transform,filter,clip-path] duration-(--duration-sweep) ease-(--ease-sweep)',
                'data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:blur-sm',
                'data-starting-style:scale-95 data-starting-style:opacity-0 data-starting-style:blur-sm',
              )}
            >
              <Popover.Close
                aria-label={t('close')}
                className={buttonVariants({
                  variant: 'ghost',
                  size: 'icon-sm',
                  className: 'absolute end-4 top-4 z-10',
                })}
              >
                <Icon name="close" />
              </Popover.Close>

              <MealDetailPanel
                meal={inspected.meal}
                candidates={candidates}
                catalog={catalog}
                usage={usage}
                planId={planId}
                locale={locale}
                editable={editable}
                model={model}
                onClose={close}
                onBrowseDishes={onBrowseDishes}
                embedded
              />
            </Popover.Popup>
          </Popover.Positioner>
        )}
      </Popover.Portal>
    </Popover.Root>
  );
}
