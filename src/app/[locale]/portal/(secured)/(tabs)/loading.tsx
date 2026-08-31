import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * What fills a portal tab while its data is read.
 *
 * The tab bar along the block-end edge is five destinations a client taps
 * between all day, and without a boundary here every one of those taps sat on
 * the tab it was leaving until the server had finished the tab it was going to.
 * The bar's own highlight moved and nothing else did — the worst version of the
 * wait, because the app had already acknowledged the tap.
 *
 * The shell above stays put: the header, the rail and the tab bar all belong to
 * the layout, so only the column between them is replaced. That is why this
 * draws no header of its own — §9.7, the loader occupies the layout rather than
 * covering it.
 *
 * Appointments keeps its own, closer, boundary; this covers home, progress and
 * the profile, which all open on a stack of cards. Three of them, not the real
 * count — enough to fill a phone's fold without pretending to a number.
 */
export default function PortalTabLoading() {
  return (
    <div className="space-y-4" aria-busy>
      {[0, 1, 2].map((index) => (
        <Card key={index}>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-40 max-w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
