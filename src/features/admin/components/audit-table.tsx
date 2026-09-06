import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/ui/icon';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { Link } from '@/i18n/navigation';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

import { actionSpec } from '../audit-rules';
import type { AuditEntry } from '../audit';

/**
 * How the log reads.
 *
 * ## Every row is self-contained
 *
 * The entry carries `actorEmail` and `targetLabel` as snapshots taken when it
 * was written, so a row about a clinic that has since been renamed — or deleted
 * — still says who did what to what. Nothing here joins back to a live table.
 * That is the whole design of the schema and it is what makes the log usable
 * months later rather than only this week.
 *
 * ## The time is a full timestamp, not a date
 *
 * Everywhere else in this product a date is enough: an appointment is on a day,
 * a plan covers a week. An audit entry is the one thing where "which of the four
 * times someone pressed this" is the question, so it takes `formatDateTime`.
 *
 * ## Refusals look different from actions
 *
 * A refused attempt is not a thing that happened to the target — it is a thing
 * that did not happen — and rendering the two identically would make the log
 * read as though a clinic had been suspended twice. The badge says which, and
 * the reason column says why the system said no.
 */

/**
 * Verb to message key.
 *
 * ⚠ The keys on the right are **camelCase, not the dotted verb**. next-intl
 * reads `.` as nesting, so `actions.clinic.suspend` is a path to
 * `actions → clinic → suspend` and a literal key containing a dot is rejected
 * outright — with an `INVALID_KEY` thrown from the *root* provider, which takes
 * down every screen in the application rather than this one. Neither `tsc` nor
 * eslint sees it; the dev server does, immediately.
 *
 * The verbs themselves keep their dots, because they are what the database
 * stores and what reads well in a filter. This map is where the two vocabularies
 * meet.
 */
const ACTION_KEY = {
  'clinic.suspend': 'actions.clinicSuspend',
  'clinic.reactivate': 'actions.clinicReactivate',
  'clinic.plan.update': 'actions.clinicPlanUpdate',
  'account.disable': 'actions.accountDisable',
  'account.enable': 'actions.accountEnable',
  'account.promote': 'actions.accountPromote',
  'catalog.food.update': 'actions.catalogFoodUpdate',
} as const;

/** The same map, exported so the audit screen's filter can label its options. */
export function actionMessageKey(action: string): string | undefined {
  return ACTION_KEY[action as keyof typeof ACTION_KEY];
}

const TARGET_KEY = {
  clinic: 'targets.clinic',
  account: 'targets.account',
  food: 'targets.food',
} as const;

const REFUSAL_KEY = {
  self: 'refusals.self',
  lastAdmin: 'refusals.lastAdmin',
  reasonRequired: 'refusals.reasonRequired',
  notStaff: 'refusals.notStaff',
  hasClients: 'refusals.hasClients',
} as const;

/**
 * The words for a verb.
 *
 * An unrecognised action prints its raw key rather than throwing. `action` is a
 * text column, so a row written by an older build — or by a verb since renamed —
 * is a state this has to survive, and a log that 500s because of one row is a log
 * nobody can read at the moment they need it most.
 */
async function actionLabel(action: string) {
  const t = await getTranslations('admin.audit');
  const key = ACTION_KEY[action as keyof typeof ACTION_KEY];

  return key ? t(key) : action;
}

/** Where the target can be opened, when it is a thing with a screen. */
function targetHref(entry: AuditEntry): string | null {
  if (entry.targetType === 'clinic') return `/admin/clinics/${entry.targetId}`;
  if (entry.targetType === 'food') return `/admin/catalog/${entry.targetId}`;
  // An account has no page of its own — the register is filtered to it instead.
  if (entry.targetType === 'account') return `/admin/accounts?q=${encodeURIComponent(entry.targetLabel)}`;

  return null;
}

/** The reason, or the refusal that stood in for one. */
async function reasonText(entry: AuditEntry): Promise<string> {
  const t = await getTranslations('admin.audit');

  if (entry.outcome === 'refused') {
    const refused =
      entry.after && typeof entry.after === 'object' && 'refused' in entry.after
        ? String((entry.after as { refused: unknown }).refused)
        : '';

    const key = REFUSAL_KEY[refused as keyof typeof REFUSAL_KEY];
    const why = key ? t(key) : refused;

    return entry.reason ? `${why} · ${entry.reason}` : why;
  }

  return entry.reason ?? t('noReason');
}

/**
 * One glyph per verb, so the short list on the overview can be scanned rather
 * than read.
 *
 * Grouped by what the verb *does* and not by what it acts on: suspending a
 * clinic and disabling an account are the same act on two registers, and giving
 * them one picture is what makes "something was taken away" findable in a column
 * of six rows. The registry's own names — nothing new was added for this.
 */
const ACTION_ICON: Record<string, IconName> = {
  'clinic.suspend': 'lock',
  'clinic.reactivate': 'restore',
  'clinic.plan.update': 'bills',
  'account.disable': 'lock',
  'account.enable': 'restore',
  'account.promote': 'security',
  'catalog.food.update': 'edit',
};

/**
 * One entry as a row, for the overview's short list.
 *
 * ## Why this stopped being one wrapping line
 *
 * It was five spans in a `flex-wrap` at three type sizes — verb, target, badge,
 * timestamp, address — so a narrow column broke it wherever it ran out of room
 * and the address ended up under the verb it had nothing to do with. Six of them
 * stacked read as a paragraph with the words in a different order each time.
 *
 * The shape now is the one every activity feed converges on and for the same
 * reason: **a glyph, a sentence, and a time.** The glyph says what kind of thing
 * happened before anything is read; the sentence is verb-then-target on one
 * line, which is the order both languages state it in; the actor and the
 * timestamp drop to a quiet second line, because they answer "who and when",
 * which is the question you ask *after* you have found the row you wanted.
 *
 * The timestamp is pushed to the inline-end on wide rows and folds under on
 * narrow ones — `ms-auto` on a wrapping flex line, so nothing is truncated and
 * nothing overlaps at any width.
 *
 * A refusal keeps its badge. It is not a thing that happened to the target, and
 * the disc goes amber with it so the row reads as "declined" from the margin.
 */
export async function AuditLine({ entry, locale }: { entry: AuditEntry; locale: Locale }) {
  const t = await getTranslations('admin.audit');
  const label = await actionLabel(entry.action);
  const href = targetHref(entry);
  const spec = actionSpec(entry.action);
  const refused = entry.outcome === 'refused';

  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full',
          refused
            ? 'bg-status-attention-bg text-status-attention-fg'
            : spec?.destructive
              ? 'bg-status-medical-bg text-status-medical-fg'
              : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon name={ACTION_ICON[entry.action] ?? 'history'} className="size-4" />
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-body-sm font-medium">{label}</span>

          {href ? (
            <Link
              href={href}
              className="min-w-0 truncate rounded-sm text-body-sm underline-offset-4 outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {entry.targetLabel}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-body-sm">{entry.targetLabel}</span>
          )}

          {refused ? <Badge variant="attention">{t('outcome.refused')}</Badge> : null}

          {/*
            `ms-auto` rather than a second column: on a wide row the time flushes
            to the inline-end where a reader's eye already goes for it, and on a
            narrow one it simply wraps onto its own line instead of squeezing the
            target's name into an ellipsis.

            ⚠ **The auto margin and the `dir` are on two different elements, and
            they have to be.** A `dir` attribute changes what that element's own
            logical properties resolve to — put both on one span and `ms-auto`
            becomes `margin-left: auto` inside an Arabic row, so the free space
            lands on the wrong side and the timestamp is pushed back towards the
            middle of the line. It looks like the margin is being ignored. It is
            being obeyed, in the other language.
          */}
          <span className="ms-auto shrink-0 text-caption text-muted-foreground">
            <span dir="ltr">{formatDateTime(locale, entry.createdAt)}</span>
          </span>
        </div>

        <p className="truncate text-caption text-muted-foreground" dir="ltr">
          {entry.actorEmail}
        </p>
      </div>
    </div>
  );
}

/** The whole log, as a table. */
export async function AuditTable({ rows, locale }: { rows: AuditEntry[]; locale: Locale }) {
  const t = await getTranslations('admin.audit');

  const prepared = await Promise.all(
    rows.map(async (entry) => ({
      entry,
      label: await actionLabel(entry.action),
      reason: await reasonText(entry),
      href: targetHref(entry),
      spec: actionSpec(entry.action),
    })),
  );

  return (
    <TableRoot>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.when')}</TableHead>
            <TableHead>{t('columns.action')}</TableHead>
            <TableHead>{t('columns.target')}</TableHead>
            <TableHead>{t('columns.actor')}</TableHead>
            <TableHead>{t('columns.reason')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prepared.length === 0 ? (
            <TableEmpty colSpan={5}>{t('empty')}</TableEmpty>
          ) : (
            prepared.map(({ entry, label, reason, href, spec }) => (
              <TableRow key={entry.id}>
                <TableCell numeric className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(locale, entry.createdAt)}
                </TableCell>

                <TableCell>
                  <span
                    className={
                      spec?.destructive && entry.outcome === 'ok'
                        ? 'font-medium text-status-attention-fg'
                        : 'font-medium'
                    }
                  >
                    {label}
                  </span>
                  {entry.outcome === 'refused' ? (
                    <Badge variant="attention" className="ms-2">
                      {t('outcome.refused')}
                    </Badge>
                  ) : null}
                </TableCell>

                <TableCell>
                  {href ? (
                    <Link href={href} className="underline-offset-4 hover:underline">
                      {entry.targetLabel}
                    </Link>
                  ) : (
                    entry.targetLabel
                  )}
                  <span className="block text-caption text-muted-foreground">
                    {/* An unknown target type prints as stored, for the reason
                        an unknown action does — the column is text. */}
                    {TARGET_KEY[entry.targetType as keyof typeof TARGET_KEY]
                      ? t(TARGET_KEY[entry.targetType as keyof typeof TARGET_KEY])
                      : entry.targetType}
                  </span>
                </TableCell>

                <TableCell className="text-muted-foreground">{entry.actorEmail}</TableCell>

                <TableCell className="max-w-xs">
                  <span className="block wrap-anywhere">{reason}</span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableRoot>
  );
}
