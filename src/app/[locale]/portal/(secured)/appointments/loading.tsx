import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * What fills the page while the appointments are read.
 *
 * The shape traces the real layout — heading, then a heavier first card and two
 * lighter ones — so that nothing jumps when the content lands. §9.7: the loader
 * occupies the layout rather than sitting on top of it, and no overlay or spinner
 * covers a page that is about to be readable anyway.
 *
 * Three cards, not the real count, which is not known yet. Enough to fill the
 * fold on a phone without pretending to a number.
 */
export default function AppointmentsLoading() {
  return (
    <div className="space-y-7" aria-busy>
      <header className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </header>

      <section className="space-y-3">
        <Skeleton className="h-4 w-28" />

        {[0, 1, 2].map((index) => (
          <Card key={index}>
            <CardContent className="flex items-stretch gap-3 sm:gap-4">
              <Skeleton className={index === 0 ? 'w-16 shrink-0 sm:w-20' : 'size-14 shrink-0'} />

              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-36 max-w-full" />
                <Skeleton className="h-4 w-48 max-w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
