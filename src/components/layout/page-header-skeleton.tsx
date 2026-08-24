import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * `PageHeader`'s shape, for the moment before a screen's data arrives.
 *
 * Every staff screen opens on the same row — the page's name on the reading
 * edge, today's date and the notification bell on the other — so every one of
 * their `loading.tsx` files opens on this. Written once here rather than nine
 * times: the header is shared, and a placeholder that drifted out of step with
 * it would put the jump back that the placeholder exists to prevent.
 *
 * The measurements trace the real row rather than approximating it: `h-8` is
 * the 24px `heading-lg` on its line box, `size-9` the bell's button, and the
 * bar beside it the long date. A header that resolved from a different height
 * to the one it is standing in for would nudge the whole page down as it
 * landed, which is the one thing this file is for.
 *
 * @param subtitle Draw the second line too, for the screens that have one —
 *   the register, the catalog. Omitted, the block is a single title.
 */
export function PageHeaderSkeleton({
  subtitle = false,
  className,
}: {
  subtitle?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2 text-start',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <Skeleton className="h-8 w-44" />
        {subtitle ? <Skeleton className="h-4 w-32" /> : null}
      </div>

      <div className="flex items-center gap-2">
        {/* The date reads long in both languages — "٢٣ أغسطس ٢٠٢٦", "23 August
            2026" — so one width serves both without either clipping. */}
        <Skeleton className="h-5 w-32 max-sm:hidden" />
        <Skeleton className="size-9" />
      </div>
    </div>
  );
}
