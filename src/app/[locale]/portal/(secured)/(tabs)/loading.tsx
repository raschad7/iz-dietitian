import { PageLoading } from '@/components/layout/page-loading';

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
 * the layout, so only the column between them is replaced. The spinner
 * therefore centres inside that column and never lands under the tab bar.
 *
 * Appointments keeps its own, closer, boundary; this covers home, progress and
 * the profile.
 */
export default function PortalTabLoading() {
  return <PageLoading />;
}
