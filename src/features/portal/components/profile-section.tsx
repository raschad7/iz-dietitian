import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';

/**
 * One grouped block of the client's profile: an icon, a name, and the rows
 * under it.
 *
 * **One card per group, not one card per field.** Five facts about the same
 * subject are one object; giving each its own surface turns a profile into a
 * scroll and makes "basic information" and "the clinic's phone number" look
 * like peers. The grouping is the information — a client scanning for their
 * allergy list is looking for the health block, not for row four.
 *
 * **The rows are a `<dl>`.** Every child is a term and its value, which is
 * what a description list is, and it gives a screen reader the pairing that
 * the visual alignment gives everyone else. Dividers rather than gaps between
 * them: the rows are a table of facts, and a hairline reads as a table while
 * whitespace reads as separate things.
 *
 * `note` is the quiet line some sections close on — who wrote this, or what to
 * do about it. It sits under the rows in muted type and is the only place a
 * section speaks in sentences.
 */
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
  /** One line under the title, when the group needs to say what it is for. */
  description?: string;
  /** `InfoRow`s, as the section's `<dl>` content. */
  children: ReactNode;
  note?: ReactNode;
  /** A control the whole section owns — contacting the clinic, for instance. */
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
