import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';

import { type DashboardStats } from '../page-data';

type StatTilesProps = {
  stats: DashboardStats;
  locale: Locale;
};

/**
 * Each tile links through to the page that owns that data. None of the four
 * has a natural filtered destination for "clients without a meal plan" or
 * "new this month", so both point at the plain clients list — the closest
 * real page — rather than a filter that doesn't exist.
 */
const TILES = [
  { key: 'activeClients', href: '/app/clients' },
  { key: 'appointmentsThisWeek', href: '/app/calendar/week' },
  { key: 'clientsWithoutMealPlan', href: '/app/clients' },
  { key: 'newClientsThisMonth', href: '/app/clients' },
] as const satisfies ReadonlyArray<{ key: keyof DashboardStats; href: '/app/clients' | '/app/calendar/week' }>;

export async function StatTiles({ stats, locale }: StatTilesProps) {
  const t = await getTranslations('dashboard.stats');

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {TILES.map((tile) => (
        <Link key={tile.key} href={tile.href} className="block">
          <Card size="sm" className="h-full transition-shadow hover:shadow-elevated">
            <CardContent className="space-y-1">
              <p className="font-mono text-2xl font-semibold text-foreground">
                {formatNumber(locale, stats[tile.key])}
              </p>
              <p className="text-xs text-muted-foreground">{t(tile.key)}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
