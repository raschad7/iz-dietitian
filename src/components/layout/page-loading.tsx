'use client';

import { useTranslations } from 'next-intl';

import { Spokes } from '@/components/ui/spokes';
import { cn } from '@/lib/utils';

/**
 * What a screen shows while its data is on the way — one mark, in the middle of
 * the area the screen is about to fill.
 *
 * **This replaced the skeletons.** Every route used to draw a grey tracing of
 * the page it was about to become: a header bar, a band of cards, a table of
 * rows. Each one was a second copy of a layout that had to be kept in step with
 * the real screen by hand, and each one guessed — the register's placeholder
 * claimed six rows for a clinic that might have two, the dashboard's claimed
 * three cards before knowing which screen under `/app` it was standing in for.
 * A spinner claims nothing, so it can never be wrong, and there is one of it to
 * maintain rather than twelve.
 *
 * ## How it ends up centred, and why it once did not
 *
 * `flex-1` and `min-h-full` together, because the boundaries under this sit in
 * two kinds of parent and each rule answers one of them:
 *
 *  - `flex-1` for a parent that is a flex column with a height — the planner's
 *    themed wrapper, the portal's account `main`.
 *  - `min-h-full` for a parent that is an ordinary block with a height — the
 *    staff shell's `main[data-slot='shell-scroll']`, which is `flex: 1 1 auto`
 *    inside the shell column and so has a resolved height for the percentage to
 *    measure against, but is not itself a flex container.
 *
 * ⚠ **Both are needed and neither is enough.** This started as
 * `min-h-[60dvh] flex-1`, which centred correctly in the flex parents and
 * visibly *above* centre everywhere else: in the staff shell `flex-1` does
 * nothing to a block parent's child, so the mark centred inside a 60dvh box
 * that began below the app bar rather than inside the content area. The two
 * halves of the product disagreed about where a loading screen sits, which is
 * exactly what a single shared loader exists to prevent.
 *
 * A viewport unit cannot fix that: the box has to be the size of the area the
 * page will occupy, and only the parent knows what that is. Which is also why
 * the portal's tab column carries `min-h-full` of its own — it is an
 * auto-height `div` between `main` and this, and a percentage measured against
 * `auto` collapses to the mark's own 40px. See the note there.
 *
 * ## The rest
 *
 * It is a client component for one reason: the label. `useTranslations` reads
 * the provider mounted in `[locale]/layout.tsx`, which resolves synchronously
 * here — a `loading.tsx` is a Suspense fallback and a fallback may not itself
 * suspend, so the async `getTranslations` used elsewhere is not available.
 *
 * The label goes on the mark rather than into a second `sr-only` node beside
 * it: `role="status"` means it is announced once, and a hidden line of text
 * next to it would be the same message twice.
 *
 * `text-spinner` is the colour — green-500, the ramp's light green one step
 * down. See the token in `globals.css` for why that step and not a lighter one.
 */
export function PageLoading({ className }: { className?: string }) {
  const t = useTranslations('common');

  return (
    <div
      className={cn('flex min-h-full flex-1 items-center justify-center', className)}
      aria-busy
    >
      <Spokes className="size-10 text-spinner" role="status" aria-label={t('loading')} />
    </div>
  );
}
