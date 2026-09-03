import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  typescript: {
    // Never ship a build that does not typecheck.
    ignoreBuildErrors: false,
  },
  turbopack: {
    root: __dirname,
  },
  /*
   * The client router cache. By default a dynamic page — and every staff screen
   * is one, they all read the session cookie — is dropped the moment you leave
   * it, so stepping away from the calendar and back re-fetched and re-rendered
   * the whole grid. Holding the payload makes that trip instant; anything that
   * mutates a booking already calls `revalidatePath`, which evicts the entry
   * regardless of this window.
   *
   * **Three minutes, not the half-minute this started at.** Thirty seconds is
   * shorter than the errand you left the page to run: opening a client's
   * record, reading it and coming back to the register took longer than that,
   * so the register was rebuilt from scratch every single time — the exact trip
   * the cache exists to make free. The revalidation above is what makes a
   * longer window safe rather than merely cheaper. Every write path in the app
   * ends in `revalidatePath`, so the only thing this window can serve stale is
   * a change made by *someone else* in the last three minutes, on a screen the
   * reader has already seen once.
   *
   * `static` matches it. There is almost nothing static in either app — the
   * splash gate reads `headers()` from the root layout — so the figure mostly
   * documents the intent.
   */
  experimental: {
    /*
     * A body composition report crosses the wire to `readReportAction` and
     * again to the save, and Next's default server-action body limit is 1 MB.
     * A Tanita result sheet is around 270 KB, but a scanned or
     * higher-resolution export runs larger, and the failure at the default is
     * an opaque rejection rather than the "that file is too big" the upload
     * control can say. `MEASUREMENT_FILE_MAX_BYTES` is the limit the app
     * actually enforces and explains; this only has to be above it.
     */
    serverActions: {
      bodySizeLimit: '8mb',
    },
    staleTimes: {
      dynamic: 180,
      static: 180,
    },
  },
};

export default withNextIntl(nextConfig);
