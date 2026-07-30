import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { type AttentionItem } from '@/features/dashboard/queries';
import { Link } from '@/i18n/navigation';

type AttentionCardProps = {
  items: AttentionItem[];
};

/**
 * Active clients falling through the cracks. Informational, never alarming —
 * `attention` (amber), never `destructive`/clay, which is reserved for
 * genuine medical flags.
 */
export async function AttentionCard({ items }: AttentionCardProps) {
  const t = await getTranslations('dashboard.attention');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item, index) => (
              <li key={`${item.clientId}-${item.reason}-${index}`}>
                <Link
                  href={`/app/clients/${item.clientId}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-start first:pt-0 last:pb-0 hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.clientName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t(`reason.${item.reason}`)}
                    </span>
                  </span>
                  <Badge variant="attention" className="shrink-0">
                    {t('badge')}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <Link href="/app/clients" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          {t('viewAll')}
        </Link>
      </CardFooter>
    </Card>
  );
}
