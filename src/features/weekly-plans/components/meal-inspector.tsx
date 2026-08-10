'use client';

import * as React from 'react';
import { Popover } from '@base-ui/react/popover';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import { preferredInspectorSide, type InspectorSide } from '../meal-inspector-position';
import type { BoardMeal, SwapCandidate } from '../queries';
import { PLANNER_THEME } from '../theme';

import { MealCardSnapshot } from './meal-card';
import { MealDetailPanel } from './meal-detail-panel';

type AnchorSnapshot = {
  insetBlockStart: number;
  insetInlineStart: number;
  width: number;
  height: number;
};

export function MealInspector({
  meal,
  anchor,
  candidates,
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

  React.useLayoutEffect(() => {
    if (!open || !anchor) {
      return;
    }
    const activeAnchor = anchor;

    function measure() {
      const rect = activeAnchor.getBoundingClientRect();
      const direction = getComputedStyle(activeAnchor).direction;

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
    window.requestAnimationFrame(() => anchor?.focus());
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
          )}
        />

        {meal && snapshot && (
          <div
            aria-hidden
            className={cn(PLANNER_THEME, 'pointer-events-none fixed z-50')}
            style={snapshot}
          >
            <MealCardSnapshot meal={meal} />
          </div>
        )}

        {meal && anchor && (
          <Popover.Positioner
            anchor={anchor}
            positionMethod="fixed"
            side={side}
            align="center"
            sideOffset={16}
            collisionPadding={16}
            collisionAvoidance={{ side: 'flip', align: 'shift', fallbackAxisSide: 'start' }}
            className="isolate z-50"
          >
            <Popover.Popup
              className={cn(
                PLANNER_THEME,
                'relative flex h-[min(42rem,calc(100vh-2rem))] w-[min(26rem,calc(100vw-2rem))] origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-popover p-4 text-popover-foreground shadow-overlay ring-1 ring-foreground/10 outline-none',
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
                  className: 'absolute end-3 top-3 z-10',
                })}
              >
                <Icon name="close" />
              </Popover.Close>

              <MealDetailPanel
                meal={meal}
                candidates={candidates}
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
