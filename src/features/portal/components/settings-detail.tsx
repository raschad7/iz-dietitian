import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';

/**
 * The body of a settings sub-screen: prose, in blocks with headings.
 *
 * Privacy and help are the two places in this app where the client is being
 * read to rather than shown a control, so they get a reading measure and a
 * looser line height instead of the row rhythm every other settings surface
 * uses. `max-w-prose` caps the line length on a desktop; on a phone it never
 * binds.
 */
export function SettingsArticle({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="max-w-prose space-y-5 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

export function SettingsArticleBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="font-heading text-sm font-medium text-secondary-foreground">{title}</h2>
      <div className="space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}
