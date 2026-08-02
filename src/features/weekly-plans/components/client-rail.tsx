import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import type { PlannableClient } from '../queries';

/**
 * The rail of clients down the start edge of the board.
 *
 * Server-rendered links rather than a picker: a dietitian works through several
 * clients in a sitting, and each one being its own URL means the browser's back
 * button and a bookmark both do the obvious thing.
 *
 * Each row carries the state of that client's newest plan, because "who has a
 * published plan and who is still a draft" is the question this page is opened to
 * answer on a Sunday morning.
 */
export function ClientRail({
  clients,
  selectedClientId,
}: {
  clients: readonly PlannableClient[];
  selectedClientId?: string;
}) {
  const t = useTranslations('weeklyPlans');

  if (!clients.length) {
    return (
      <div className="w-56 shrink-0 border-e border-border pe-3">
        <p className="p-3 text-sm text-muted-foreground">{t('noClients')}</p>
      </div>
    );
  }

  return (
    <div className="w-56 shrink-0 overflow-y-auto border-e border-border pe-3">
      <h2 className="px-3 pb-2 text-xs font-semibold text-muted-foreground">
        {t('clients')}
      </h2>

      <nav className="flex flex-col gap-0.5">
        {clients.map((client) => {
          const selected = client.id === selectedClientId;

          return (
            <Link
              key={client.id}
              href={`/app/weekly-plans/${client.id}`}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-start text-sm transition-colors',
                selected ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-accent/60',
              )}
            >
              {/* The stored colour, so a client is recognisable at a glance. */}
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: client.color }}
              />

              <span className="min-w-0 flex-1 truncate">{client.fullName}</span>

              <ClientStatus client={client} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * The one-word state of this client's newest plan.
 *
 * "No profile" outranks the plan status: without a weight and a target nothing can
 * be generated, so that is the fact worth surfacing first.
 */
function ClientStatus({ client }: { client: PlannableClient }) {
  const t = useTranslations('weeklyPlans');

  if (!client.hasProfile) {
    return (
      <Badge variant="outline" className="shrink-0">
        {t('status.noProfile')}
      </Badge>
    );
  }

  if (client.latestPlanStatus === 'published') {
    return <Badge className="shrink-0">{t('status.published')}</Badge>;
  }

  if (client.latestPlanStatus === 'draft') {
    return (
      <Badge variant="muted" className="shrink-0">
        {t('status.draft')}
      </Badge>
    );
  }

  return null;
}
