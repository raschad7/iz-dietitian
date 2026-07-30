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
};

export default withNextIntl(nextConfig);
