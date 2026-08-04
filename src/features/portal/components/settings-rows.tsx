import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SegmentedGroup, SegmentedOption } from '@/components/ui/segmented';
import { SettingsLabel } from '@/features/portal/components/settings-section';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The shapes a settings row takes, minus the one that needs the browser.
 *
 * **Every control here is a real form control inside its own form.** A segment
 * is a submit button carrying the value it selects, so choosing one posts it and
 * the screen works with JavaScript off. That is why there is no `onChange`
 * anywhere in this file: the server action revalidates and the row re-renders in
 * its new position, which is the only confirmation a setting owes.
 *
 * **One form per row, not one for the screen.** A single form would mean a slow
 * save on one setting rolling back a change made to another while it was in
 * flight, and would need a save button the client has to remember to press.
 *
 * **These are server components on purpose.** They take a lucide icon as a
 * prop, and an icon is a function — it cannot cross into a client component.
 * The switch is the one row that needs browser state, and it lives in
 * `settings-switch-row.tsx` where it imports its own.
 */

/** A setting with two to four named values, all visible at once. */
export function SettingsChoiceRow<T extends string>({
  action,
  name,
  options,
  current,
  label,
  description,
  locale,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** The field the chosen value is submitted under — `theme`, `preferredLocale`. */
  name: string;
  options: readonly { value: T; label: string }[];
  current: T;
  label: string;
  description?: string;
  locale: Locale;
}) {
  return (
    <form action={action} className="space-y-3 py-3">
      <input type="hidden" name="locale" value={locale} />

      <SettingsLabel id={`setting-${name}`} label={label} description={description} />

      <SegmentedGroup
        label={label}
        className={cn('grid w-full', options.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}
      >
        {options.map((option) => (
          <SegmentedOption
            key={option.value}
            type="submit"
            name={name}
            value={option.value}
            selected={option.value === current}
          >
            {option.label}
          </SegmentedOption>
        ))}
      </SegmentedGroup>
    </form>
  );
}

/**
 * A row that goes somewhere: security, privacy, help.
 *
 * The chevron mirrors — it points the way the reader travels — and the whole
 * row is the target, at 48px, because a link the width of its own text is a
 * thumb-sized miss on a phone.
 */
export function SettingsLinkRow({
  href,
  icon: Icon,
  label,
  description,
}: {
  href:
    | '/portal/settings/notifications'
    | '/portal/settings/contact'
    | '/portal/settings/contact-clinic'
    | '/portal/settings/security'
    | '/portal/settings/privacy'
    | '/portal/settings/terms'
    | '/portal/settings/help';
  icon: LucideIcon;
  label: string;
  description?: string;
}) {
  return (
    <Link
      href={href}
      className="-mx-2 flex min-h-12 items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none"
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium">{label}</span>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <ChevronRight className="size-4 shrink-0 text-border rtl:-scale-x-100" aria-hidden="true" />
    </Link>
  );
}

/** A read-only identifier — the phone or the email — with no control beside it. */
export function SettingsValueRow({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string | null;
  ltr?: boolean;
}) {
  const t = useTranslations('portal.profile');

  const empty = value === null || value.trim() === '';

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>

      <span className={empty ? 'text-muted-foreground' : 'min-w-0 font-medium'}>
        {empty ? t('notRecorded') : ltr ? <bdi dir="ltr">{value}</bdi> : value}
      </span>
    </div>
  );
}
