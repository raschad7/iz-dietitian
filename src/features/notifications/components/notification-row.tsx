'use client';

import { useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { patientToneStyle } from '@/features/booking/patient-color';
import { type StaffAttentionNotification } from '@/features/notifications/types';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function NotificationRow({
  item,
  unread,
  compact = false,
  onOpen,
  onDelete,
}: {
  item: StaffAttentionNotification;
  unread: boolean;
  compact?: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('notifications');

  return (
    <li
      className={cn(
        'group/notification flex min-w-0 items-stretch transition-colors',
        unread ? 'bg-secondary/35' : 'bg-card',
        compact ? 'hover:bg-accent' : 'rounded-lg border border-border hover:bg-accent',
      )}
    >
      <Link
        href={`/app/clients/${item.clientId}`}
        onClick={onOpen}
        className={cn(
          'flex min-w-0 flex-1 items-start gap-3 text-start outline-none',
          'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring',
          compact ? 'px-3 py-3' : 'p-4',
        )}
      >
        <span className="patient-tone shrink-0" style={patientToneStyle(item.clientSeq)}>
          <Avatar name={item.clientName} color="var(--tone-mark)" size={compact ? 'sm' : 'default'} />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-body-sm font-semibold" dir="auto">
              {item.clientName}
            </span>
            {unread ? (
              <span className="size-2 shrink-0 rounded-full bg-primary">
                <span className="sr-only">{t('unread')}</span>
              </span>
            ) : null}
          </span>
          <span className="text-body-sm text-muted-foreground" dir="auto">
            {t(`attention.${item.reason}`)}
          </span>
        </span>
      </Link>

      <div className={cn('flex shrink-0 items-center', compact ? 'pe-2' : 'pe-3')}>
        <Button
          type="button"
          variant="destructiveGhost"
          size="icon-sm"
          aria-label={t('deleteFor', { name: item.clientName })}
          title={t('delete')}
          onClick={onDelete}
        >
          <Icon name="trash" className="size-4" />
        </Button>
      </div>
    </li>
  );
}
