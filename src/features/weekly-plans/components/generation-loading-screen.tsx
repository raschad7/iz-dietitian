'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Icon, type IconName } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { NewWeekMode } from '../new-week';

const FRAMES = [
  { icon: 'mealBreakfast', message: 'targets' },
  { icon: 'mealLunch', message: 'catalog' },
  { icon: 'mealSnack', message: 'balance' },
  { icon: 'mealDinner', message: 'draft' },
] as const satisfies readonly { icon: IconName; message: 'targets' | 'catalog' | 'balance' | 'draft' }[];

/**
 * The protected wait state for full-week generation.
 *
 * The request itself owns this component's lifetime: it mounts only while the
 * real server action is pending and disappears on the actual response. The
 * elapsed clock is therefore real. The bar stays indeterminate and the food
 * frames describe the work as a whole rather than claiming a percentage or a
 * backend phase the client cannot observe.
 */
export function GenerationLoadingScreen({ mode }: { mode: NewWeekMode }) {
  const t = useTranslations('weeklyPlans');
  const rootRef = useRef<HTMLElement>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    rootRef.current?.focus();

    const startedAt = Date.now();
    const elapsedTimer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frameTimer = reduceMotion
      ? undefined
      : window.setInterval(() => {
          setFrameIndex((current) => (current + 1) % FRAMES.length);
        }, 2200);

    return () => {
      window.clearInterval(elapsedTimer);
      if (frameTimer !== undefined) window.clearInterval(frameTimer);
    };
  }, []);

  const activeFrame = FRAMES[frameIndex] ?? FRAMES[0];

  return (
    <section
      ref={rootRef}
      role="status"
      tabIndex={-1}
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
      /*
        The 30rem floor is what keeps this screen from collapsing to the height
        of its own three lines while the plan is being written, so the dialog
        does not shrink and re-grow around it. `min()` is the landscape half of
        that: a phone turned sideways is ~390px tall, the sheet this renders in
        is capped at 90dvh, and an unconditional 480px floor made a *status*
        screen — one with nothing to read past the first paragraph and no
        control to reach — something the reader had to scroll. Below ~686px of
        viewport the floor yields and the screen simply fills what it is given.
      */
      className="flex min-h-[min(30rem,70dvh)] flex-col items-center justify-center px-4 py-10 text-center outline-none sm:px-10"
    >
      <div aria-hidden="true" className="relative mb-8 flex size-28 items-center justify-center rounded-full bg-secondary">
        {FRAMES.map((frame, index) => (
          <Icon
            key={frame.icon}
            name={frame.icon}
            className={cn(
              'absolute size-14 text-primary transition-[opacity,transform,filter] duration-500 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none',
              index === frameIndex
                ? 'scale-100 opacity-100 blur-none'
                : 'scale-90 opacity-0 blur-[2px]',
            )}
          />
        ))}
      </div>

      <div className="max-w-xl space-y-2">
        <h2 className="text-heading-lg font-semibold text-balance">
          {t(mode === 'regenerate' ? 'generationLoading.regenerateTitle' : 'generationLoading.title')}
        </h2>
        <p className="text-body-sm text-muted-foreground text-pretty">
          {t('generationLoading.description')}
        </p>
      </div>

      <div className="mt-7 w-full max-w-sm space-y-3">
        <Skeleton className="h-1.5 w-full" />

        <p className="text-label tabular-nums text-muted-foreground" aria-hidden="true">
          {t('generationLoading.elapsed', { seconds: elapsedSeconds })}
        </p>
      </div>

      <div aria-hidden="true" className="mt-6 flex min-h-12 max-w-md items-start justify-center overflow-hidden">
        <p
          key={activeFrame.message}
          className="text-body-md text-secondary-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
        >
          {t(`generationLoading.activity.${activeFrame.message}`)}
        </p>
      </div>

      <div className="mt-8 flex max-w-lg items-center gap-2 text-caption text-muted-foreground">
        <Icon name="check" className="size-4 text-primary" />
        <span>{t('generationLoading.review')}</span>
      </div>
    </section>
  );
}
