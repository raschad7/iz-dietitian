/**
 * What the account screens look like while their data is on the way.
 *
 * **The header is drawn for real, not as a grey bar.** It is the same height
 * and the same material as the one the page renders, so the screen does not
 * jump when the content lands — and a client who tapped "back" during the wait
 * still sees where the control will be. Only the parts that depend on the
 * client's record are placeholders.
 *
 * Shared by every screen in the group rather than written per route: they all
 * open on a header and a stack of cards, and four near-identical skeletons
 * would be four things to keep in step with one layout.
 *
 * The bars carry `animate-pulse` and nothing else. A shimmer sweeping across a
 * medical record is decoration on a screen whose whole job is to be calm.
 */
export default function ScreenLoading() {
  return (
    <>
      <div className="sticky top-0 z-30 border-b border-border bg-card/95">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-2 py-2 md:px-4">
          <span className="size-11 shrink-0" />
          <span className="mx-auto h-4 w-32 animate-pulse rounded-full bg-muted" />
          <span className="size-11 shrink-0" />
        </div>
      </div>

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6" aria-busy="true">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {/*
            One tall block for the identity card and two shorter ones for the
            sections under it — the shape of the real screen, so the wait reads
            as this page loading rather than as a generic spinner.
          */}
          <div className="h-28 animate-pulse rounded-lg rounded-ee-4xl bg-card ring-1 ring-foreground/10" />
          <div className="h-52 animate-pulse rounded-lg rounded-ee-4xl bg-card ring-1 ring-foreground/10" />
          <div className="h-52 animate-pulse rounded-lg rounded-ee-4xl bg-card ring-1 ring-foreground/10" />
        </div>
      </main>
    </>
  );
}
