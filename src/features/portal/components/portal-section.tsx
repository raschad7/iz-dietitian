import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/ui/icon';

/**
 * A titled block on a portal page.
 *
 * The portal's pages are read top to bottom on a phone, so every section states
 * what it is and how much of it there is before the content starts. The icon is
 * the same one the destination carries elsewhere in the app, which is what makes
 * a long scrolling page scannable without reading the headings.
 *
 * The count is deliberately omitted when a section is empty: "0" next to a
 * heading, above an empty state that already says the same thing, is noise.
 */
export function PortalSection({
  icon,
  title,
  count,
  children,
}: {
  icon: IconName;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon name={icon} className="size-4 shrink-0" />
        <span>{title}</span>
        {count !== undefined && count > 0 ? (
          <Badge variant="muted" className="ms-auto tabular-nums">
            {count}
          </Badge>
        ) : null}
      </h3>

      {children}
    </section>
  );
}
