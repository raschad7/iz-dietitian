import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';

/**
 * One group of settings: a heading and the rows under it.
 *
 * The settings screen is ten things, and ten rows in one list is a wall. These
 * are the four groups they actually fall into — what the clinic may send you,
 * how the app should look and speak, your account, and where to get help — so
 * someone looking for the language switch scans four headings instead of ten
 * rows.
 *
 * Structurally the same object as `ProfileSection`, deliberately not shared
 * with it: that one renders a `<dl>` of facts and this one renders controls,
 * and merging them would mean a component with a flag deciding which of two
 * element trees to emit.
 */
export function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  /** A name from the Solar registry — the app has one icon set. */
  icon: IconName;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <div className="flex items-start gap-3 pb-2">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary"
          >
            <Icon name={icon} className="size-4.5" />
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-sm leading-snug font-medium">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>

        <div className="divide-y divide-border border-t border-border">{children}</div>
      </CardContent>
    </Card>
  );
}

/**
 * The label side of a settings row: what this controls, and one line on what it
 * means when it is on.
 *
 * Split out because three different row types need exactly this block beside
 * three different controls, and because the `id` it carries is what names the
 * control to a screen reader — a `<label>` cannot wrap a `role="switch"` button
 * or a group of segments, so `aria-labelledby` does the job instead.
 */
export function SettingsLabel({
  id,
  label,
  description,
}: {
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      {description ? (
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
