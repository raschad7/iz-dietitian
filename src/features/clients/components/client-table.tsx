import { useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
  TableSortLabel,
} from '@/components/ui/table';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { calculateAge } from '@/features/clients/age';
import { ArchiveButton } from '@/features/clients/components/archive-button';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { type ClientListResult } from '@/features/clients/queries';
import { type ClientSort, type ListClientsInput } from '@/features/clients/schema';
import { type PlanStatus } from '@/features/weekly-plans/schema';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The client register.
 *
 * **The whole row is the link to the record.** A name that is the only target
 * in a 48px row is a small target on a phone and an odd one on a desktop, where
 * the pointer is already over the row. It is done with a stretched link — a
 * real `<Link>` in the name cell whose `::after` covers the row — rather than
 * an `onClick`, so the row keeps every affordance of a link (keyboard focus,
 * middle-click, open in a new tab, a URL in the status bar) and this file stays
 * a server component. The action cell sits `relative` so its own controls stay
 * above that overlay and remain separately clickable.
 *
 * The actions are icons rather than labels: three text buttons per row is
 * wider than the data in most columns, and at 20 rows the column of repeated
 * words is the loudest thing on the page. Each one keeps a real `aria-label`
 * and gains a hover/focus tooltip — the icon is shorthand for people who
 * already know the screen, never the only way to find out what it does.
 */

/**
 * Columns a reader can order the register by, in the order they appear.
 *
 * ## What is here, and what is not
 *
 * **Email is gone.** It was the widest column on the table and the least
 * looked at: this clinic reaches people by phone and by WhatsApp, the portal
 * invitation is the one thing that ever used the address, and an email is a
 * value you copy off a record rather than one you scan a list by. It is still
 * on the client's own card, and it is still a filter — the search toolbar can
 * find a client by address without the register spending a fifth of its width
 * showing all of them.
 *
 * **Status is gone.** It said "active" on virtually every row, which is the
 * design system's own test for a column that marks nothing (see "A badge is a
 * state"). Archived clients have a page of their own now, so which half of the
 * register you are reading is a property of the page rather than of each line
 * in it.
 *
 * **Age is new**, and it is the column the register was missing. It is the one
 * fact a dietitian re-derives constantly — targets, plan sizing and what counts
 * as a healthy range all turn on it — and it was only readable by opening the
 * record. The dashboard's own register card has shown name, age and phone for
 * some time; the two lists of the same people now finally agree.
 *
 * **No column is `numeric`, including phone.** That prop puts `dir="ltr"` on
 * the cell itself, which does keep the value's characters in Latin order — but
 * it also re-resolves `text-start` against the *cell*, so in Arabic that column
 * flushed left while every column beside it flushed right, and the table read
 * as two tables. The order the digits are written in is a property of the
 * value, not of the column, so it is isolated on the value itself below and the
 * cell is left to follow the page.
 *
 * **Phone is no longer a column of its own.** It rides under the name in the
 * first cell instead — a phone number is not something anyone scans a list
 * *by*, it is something you read off the row you have already found, and as its
 * own column it cost the register a full column's width to say so. Stacking it
 * under the name also gives the row two lines to sit against the 36px initials
 * disc beside it, which is what makes the first column read as a person rather
 * than as two unrelated facts. It is still a filter, and still sortable by URL;
 * only the header is gone.
 *
 * **Plan is new, and it is the one column here that cannot be sorted.** It is
 * not a column on `clients` — it is the status of the newest row in
 * `weekly_plans` for this person (see `latestPlanStatuses`), merged in after the
 * page has already been chosen. Ordering by it would mean moving that lookup
 * into the `ORDER BY` of the paged query, which is the join that breaks both the
 * `LIMIT` and the pager's `count()`. It carries no `sorted` prop at all rather
 * than `sorted={false}`: the latter sets `aria-sort="none"`, which tells a
 * screen reader the column *can* be sorted and this one cannot.
 */
const COLUMNS = [
  { key: 'fullName', sortable: true },
  { key: 'age', sortable: true },
  { key: 'plan', sortable: false },
  { key: 'portalAccess', sortable: true },
] as const satisfies ReadonlyArray<
  { key: ClientSort; sortable: true } | { key: 'plan'; sortable: false }
>;

export function ClientTable({
  result,
  input,
  filtered,
  locale,
  basePath = '/app/clients',
  archived = false,
}: {
  result: ClientListResult;
  input: ListClientsInput;
  filtered: boolean;
  locale: Locale;
  /**
   * The route this table's own links point back at — its sort headers and its
   * "clear filters" way out. The archive is the same table over the other half
   * of the register, and a sort header there must not navigate to the active
   * list.
   */
  basePath?: '/app/clients' | '/app/clients/archived';
  /** Archived rows offer Restore where active ones offer Archive. */
  archived?: boolean;
}) {
  const t = useTranslations('clients');
  const tNav = useTranslations('nav');

  if (result.items.length === 0) {
    return (
      <Card variant="empty" className="items-center gap-4 p-8 text-center">
        <p>{filtered ? t('emptyFiltered') : archived ? t('archive.empty') : t('empty')}</p>

        {/* An empty list with no way out is a dead end; offer the next step. */}
        {filtered ? (
          <Link href={basePath} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('clearFilters')}
          </Link>
        ) : archived ? null : (
          <ClientFormTrigger locale={locale} className={buttonVariants({ size: 'sm' })}>
            {t('new')}
          </ClientFormTrigger>
        )}
      </Card>
    );
  }

  /**
   * Where a header points.
   *
   * Clicking the column already in effect flips its direction; clicking any
   * other starts it ascending, because a column you have just chosen to sort by
   * is one you want to read from the top. Sorting always returns to page 1 —
   * page 3 of a differently ordered list is not the same page 3.
   */
  const sortHref = (key: ClientSort) => ({
    pathname: basePath,
    query: {
      ...(input.q ? { q: input.q } : {}),
      ...(input.filterBy && input.filterValue
        ? { filterBy: input.filterBy, filterValue: input.filterValue }
        : {}),
      sort: key,
      dir: input.sort === key && input.dir === 'asc' ? 'desc' : 'asc',
    },
  });

  return (
    /*
      From `md` up this is the only part of the register that scrolls: the
      page hands it a bounded height and the rows move inside it, so the
      title, the search field and the pager stay where the reader left them.
      Below that the page scrolls as one — see the page component — and the
      sticky header simply pins itself to the top of the app shell instead.
    */
    <TableRoot className="md:min-h-0 md:flex-1 md:overflow-y-auto">
      <Table>
        <TableHeader sticky>
          <TableRow>
            {COLUMNS.map((column) => {
              // Plain text, no link and no `aria-sort` — see the note on
              // `COLUMNS` for why this one column cannot be ordered by.
              if (!column.sortable) {
                return <TableHead key={column.key}>{t(`fields.${column.key}`)}</TableHead>;
              }

              const active = input.sort === column.key ? input.dir : false;

              return (
                <TableHead key={column.key} sorted={active} className="p-0">
                  {/*
                    The link fills the cell rather than sitting inside it, so
                    the whole header is the target and not just the words.
                  */}
                  <Link
                    href={sortHref(column.key)}
                    className="flex w-full items-center px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    <TableSortLabel direction={active}>{t(`fields.${column.key}`)}</TableSortLabel>
                  </Link>
                </TableHead>
              );
            })}

            {/* Actions are not a column you can sort, so this head carries no `sorted`. */}
            <TableHead className="text-end">
              <span className="sr-only">{t('fields.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.items.map((client) => (
            <TableRow key={client.id} linked>
              {/*
                Who this is: the disc, the name, and the number under it. One
                cell rather than three, so the three parts of an identity move
                together and the row has a single place the eye starts from.
              */}
              <TableCell>
                <div className="flex items-center gap-3">
                  {/*
                    The client's own stored colour, the same one the calendar
                    and the planner rail show them in — a disc whose hue changed
                    between screens would be worse than no disc at all. The
                    component is `aria-hidden`: the name it stands for is right
                    beside it, and announcing both says the person twice.
                  */}
                  <Avatar name={client.fullName} color={client.color} />

                  {/* `min-w-0` so a long name wraps inside the cell instead of
                      pushing the table wider than the page. */}
                  <div className="flex min-w-0 flex-col">
                    {/*
                      `after:absolute after:inset-0` is what stretches this link
                      over the whole row — see the `linked` prop on TableRow.
                    */}
                    <Link
                      href={`/app/clients/${client.id}`}
                      /*
                        The focus ring stays on the words, not on the stretched
                        `::after` — a keyboard reader tabbing down the list needs
                        to see *which* name they are on, and a ring drawn around
                        the whole row is the same shape as the row's hover fill.
                      */
                      className={cn(
                        'rounded-sm font-medium underline-offset-4 after:absolute after:inset-0 after:content-[""]',
                        'focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2',
                      )}
                    >
                      {client.fullName}
                    </Link>

                    {/*
                      The outer span keeps the page's direction, so this line
                      flushes to the same edge as the name above it; `dir` on the
                      inner one isolates the value and runs it left-to-right,
                      which is how a phone number is read in both locales.
                      Letting the number inherit the Arabic direction moves a
                      leading `+` to the wrong end of it.

                      Quieter than the name and a size down: it is how you reach
                      this person once you have found them, never how you find
                      them, and at full weight two lines of equal voice would
                      leave the column with no subject.
                    */}
                    <span className="tabular text-caption text-muted-foreground">
                      {client.phone ? <span dir="ltr">{client.phone}</span> : <Missing />}
                    </span>
                  </div>
                </div>
              </TableCell>

              {/*
                Computed per render, never stored: an age is a number about
                today, and one written into the row would be wrong the morning
                after a birthday. A corrupt or implausible birth date reads as
                no age at all rather than as a number nobody can explain — the
                same rule the client's own profile card follows.
              */}
              <TableCell className="tabular">
                <Age dateOfBirth={client.dateOfBirth} />
              </TableCell>

              {/*
                Where this person stands in the planner — the one column here
                that earns a chip, because it is the only one whose value
                actually differs down the page. See `PlanBadge`.
              */}
              <TableCell>
                <PlanBadge status={client.latestPlanStatus} />
              </TableCell>

              {/*
                Whether this person can sign in. A chip like the plan beside
                it — the two columns answer the same shape of question about a
                client, and one as a pill and the other as a bare glyph read as
                two different kinds of fact.

                Both states are drawn, and neither is green. `default` is the
                brand's quiet olive, not `onTrack`: a portal account is a
                *setting*, not progress, and putting the plan column's success
                colour on it would give a row with no plan and a login the same
                one flash of green as a row with a live plan. `muted` for the
                absence rather than the em dash the other columns use — a dash
                is a value nobody has recorded, and "no portal account" is a
                definite answer.
              */}
              <TableCell>
                {client.hasPortalAccess ? (
                  <Badge variant="default">
                    <Icon name="check" />
                    {t('portal.granted')}
                  </Badge>
                ) : (
                  <Badge variant="muted">{t('portal.none')}</Badge>
                )}
              </TableCell>

              {/*
                Row actions: the things worth doing without opening the record.
                `relative` lifts the cell above the row's stretched link so
                these stay separately clickable.
              */}
              <TableCell className="relative">
                {/*
                  `gap-0.5`, and 20px glyphs inside the same 40px targets. Three
                  icons spaced like three separate controls read as three
                  decisions; closed up they read as one set belonging to this
                  row, which is what they are. The buttons do not shrink with
                  the gap — the touch target is the 40px circle either way, and
                  the glyph grows into the room the spacing gave back.

                  `size-5` has to be on each `Icon`: the button base only sizes
                  glyphs that carry no `size-` class of their own, and it does
                  it at a specificity a wrapper class cannot outrank.
                */}
                <div className="flex items-center justify-end gap-0.5">
                  {/* Straight to this client's board — the client is the route, not a query param. */}
                  <TooltipHint label={tNav('weeklyPlans')}>
                    <Link
                      href={`/app/weekly-plans/${client.id}`}
                      aria-label={tNav('weeklyPlans')}
                      className={buttonVariants({ variant: 'neutralGhost', size: 'icon-sm' })}
                    >
                      <Icon name="weeklyPlans" className="size-5" />
                    </Link>
                  </TooltipHint>

                  <TooltipHint label={t('edit')}>
                    <ClientFormTrigger
                      locale={locale}
                      clientId={client.id}
                      aria-label={t('edit')}
                      className={buttonVariants({ variant: 'neutralGhost', size: 'icon-sm' })}
                    >
                      <Icon name="edit" className="size-5" />
                    </ClientFormTrigger>
                  </TooltipHint>


                  <ArchiveButton locale={locale} clientId={client.id} archived={archived} iconOnly />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableRoot>
  );
}

/**
 * Where this client stands in the planner, as a chip.
 *
 * Three states, from the status of their newest plan — not from "has ever had
 * one". A client whose latest week is still a draft is in a different position
 * from one whose latest week is live, and the register's job is to say which
 * without anyone opening the board.
 *
 * ## The colours are not a traffic light
 *
 * `onTrack` is the only fill here, and it goes on the one state that needs
 * nothing done to it. The other two are absences, and the design system has a
 * shape for an absence: `incomplete`'s dashed edge on neutral, never amber and
 * never clay. A draft is not a *problem* — it is work in progress, and half a
 * register wearing warning colours on a Sunday morning would make the colour
 * mean "this clinic has clients" rather than "look here".
 *
 * An `archived` plan reads as no plan, which is what it is: the row exists, but
 * nothing about it is live and nobody is being fed by it. It shares `none`'s
 * chip rather than getting a fourth state, because the answer to "what does
 * this person need" is the same for both — a plan.
 */
function PlanBadge({ status }: { status: PlanStatus | null }) {
  const t = useTranslations('clients');

  if (status === 'published') return <Badge variant="onTrack">{t('plan.published')}</Badge>;
  if (status === 'draft') return <Badge variant="incomplete">{t('plan.draft')}</Badge>;

  return <Badge variant="muted">{t('plan.none')}</Badge>;
}

/**
 * Age from a stored birth date, or nothing.
 *
 * `calculateAge` returns `null` for a date it cannot believe — a corrupt row, a
 * typo'd century — and that reads as no age at all rather than as a number
 * nobody can explain. The same rule the client's own profile card follows.
 */
function Age({ dateOfBirth }: { dateOfBirth: string | null }) {
  const t = useTranslations('clients');

  const age = dateOfBirth ? calculateAge(dateOfBirth) : null;
  if (age === null) return <Missing />;

  return <>{t('yearsOld', { count: age })}</>;
}

/**
 * A column held open with nothing in it.
 *
 * `aria-hidden`, because the dash is a ruling device: a screen reader
 * announcing "dash" between a name and a phone number is worse than the silence
 * of an empty cell, and "not recorded" said out loud on every second row would
 * bury the rows that do have the value. The same mark, for the same reason, as
 * the dashboard's register card.
 */
function Missing() {
  return (
    <span aria-hidden className="text-muted-foreground/60">
      —
    </span>
  );
}
