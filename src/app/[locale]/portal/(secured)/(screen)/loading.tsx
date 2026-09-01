import { PageLoading } from '@/components/layout/page-loading';
import { PORTAL_COLUMN } from '@/features/portal/layout';
import { cn } from '@/lib/utils';

/**
 * What the account screens show while their data is on the way.
 *
 * **The header strip is drawn for real, and it is not a placeholder.** It is
 * the same height and the same material as the one the page renders, so the
 * screen does not jump when the content lands — a client who tapped "back"
 * during the wait still sees the bar where the control will be. It carries no
 * title: the title is the page's, and this boundary does not know which of the
 * four screens in the group it is standing in for.
 *
 * Shared by every screen in the group rather than written per route.
 */
export default function ScreenLoading() {
  return (
    <>
      <div className="sticky top-0 z-30 border-b border-border bg-card/95">
        <div className={cn('flex items-center gap-1 px-2 py-2 md:px-4', PORTAL_COLUMN)}>
          <span className="size-11 shrink-0" />
        </div>
      </div>

      <main className="flex min-w-0 flex-1 flex-col px-4 py-5 md:px-6">
        <PageLoading />
      </main>
    </>
  );
}
