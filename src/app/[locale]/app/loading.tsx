import { PageLoading } from '@/components/layout/page-loading';

/**
 * What the staff app shows the instant you arrive, before the screen's data is.
 *
 * **This file is why navigation in this app is immediate.** Without a `loading`
 * boundary a route change is not committed until the server has finished the
 * page, so a click sat on the *old* screen for as long as the *new* one took to
 * query — the reader had already decided to leave and the app had not moved.
 * With one, React commits the navigation on the click and renders this in the
 * gap: the rail highlights the new section, the URL changes, and the page fills
 * in underneath. The wait is the same length; it is spent in the right place.
 *
 * It is also what makes the rail's links prefetchable. Every staff screen is
 * dynamic — they all read the session cookie — and Next will only prefetch a
 * dynamic route as far as its nearest `loading` file. With none in the tree
 * there was nothing static to fetch ahead, so `<Link>` prefetching did nothing
 * at all on this half of the product. **So the file has to stay even though its
 * contents are now four lines: delete it to "simplify" and both properties go
 * with it.**
 *
 * It stands in for the dashboard and for every screen under `/app` that has no
 * closer boundary. It no longer traces their shape — see `PageLoading`.
 */
export default function AppLoading() {
  return <PageLoading />;
}
