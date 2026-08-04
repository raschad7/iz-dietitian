import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';

export function ProfileSection({
  icon: Icon,
  title,
  description,
  children,
  note,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary"
          >
            <Icon className="size-4.5" strokeWidth={1.8} />
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-sm leading-snug font-medium">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>

        <dl className="divide-y divide-border border-t border-border">{children}</dl>

        {note ? <div className="text-xs leading-relaxed text-muted-foreground">{note}</div> : null}

        {action}
      </CardContent>
    </Card>
  );
}
