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
   * Hosts allowed to reach the dev server from an origin other than the one it
   * is listening on.
   *
   * **Development only, and it exists for one job: testing the portal on a real
   * phone.** Web Push needs a secure context, and a laptop's LAN address over
   * plain HTTP is not one — so a phone reaches `next dev` through an HTTPS
   * tunnel instead, and Next then sees a request whose `Host` is a
   * `trycloudflare.com` name rather than `localhost` and blocks it. Without
   * this, the tunnel serves the page but every `/_next/*` asset is refused.
   *
   * It has no effect on `next build` or `next start`, so nothing here reaches
   * production. Add whatever tunnel you use; the entry is a hostname pattern,
   * never a full URL.
   */
  allowedDevOrigins: ['*.trycloudflare.com'],
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
    staleTimes: {
      dynamic: 180,
      static: 180,
    },
  },
};

export default withNextIntl(nextConfig);
