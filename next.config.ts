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
   * the whole grid. Holding the payload for half a minute makes that trip
   * instant; anything that mutates a booking already calls `revalidatePath`,
   * which evicts the entry regardless of this window.
   */
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default withNextIntl(nextConfig);
