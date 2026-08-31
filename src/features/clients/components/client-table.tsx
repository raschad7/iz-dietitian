import { useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
  TableSortLabel,
} from '@/components/ui/table';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { ROW_ACTION_CLASS } from '@/features/billing/components/row-action';
import { patientToneStyle } from '@/features/booking/patient-color';
import { calculateAge } from '@/features/clients/age';
import { ArchiveButton } from '@/features/clients/components/archive-button';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import {
  type ClientListResult,
  type ClientWeeklyProgress,
  type LivePlanStatus,
} from '@/features/clients/queries';
import { type ClientSort, type ListClientsInput } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
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
 * state"). The archive is a view of the register now — the toolbar's toggle —
 * so which half you are reading is a property of the list rather than of each
 * line in it.
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
 *
 * **Weekly progress is new, and it cannot be sorted either**, for exactly the
 * reason Plan cannot: it is derived after the page has already been chosen —
 * from `client_plan_adherence` rather than from a column on `clients` — so
 * ordering by it would mean the same join into the `ORDER BY` that breaks both
 * the `LIMIT` and the pager's `count()`. It carries no `sorted` prop at all,
 * for the same `aria-sort` reason as Plan.
 *
 * It sits *beside* Plan rather than at the end of the row because the two
 * answer one question together: what was this person given, and are they
 * keeping to it. With the portal column between them, the answer sat two stops
 * away from the question it belongs to.
 */
/**
 * The columns, and the width each one waits for.
 *
 * Six tracks — these five plus the row actions — come to roughly 820px at their
 * natural widths, and nothing below a desktop has that. A tablet gives this page
 * about 672px and a phone about 271px, because the staff rail is locked to its
 * 56px icon column at every width; `TableRoot` is `overflow-x-auto`, so what
 * the register actually did there was scroll sideways with no visible bar to say
 * so — `globals.css` takes the bars off every scroller in the app. A register
 * you have to swipe to read is one you cannot scan, which is the only thing a
 * register is for.
 *
 * So each column arrives where it fits, the widest waiting longest:
 *
 * - **Phone** — the identity column alone: the disc, the name and the number
 *   under it. That is a list of people, which is what this screen is, and the
 *   whole row is already a link to the record where everything else lives.
 * - **`sm`** — the row actions come back.
 * - **`md`** — age and portal access, the two narrow ones.
 * - **`lg`** — the plan chip.
 * - **`xl`** — the weekly progress ring, the widest of them.
 *
 * ⚠ The class goes on the head *and* on the matching cell. Hide one and the
 * body and the header count different tracks, and every column from there on
 * lands under the wrong name.
 */
const COLUMNS = [
  { key: 'fullName', sortable: true, className: '' },
  { key: 'age', sortable: true, className: 'hidden md:table-cell' },
  { key: 'plan', sortable: false, className: 'hidden lg:table-cell' },
  { key: 'weeklyProgress', sortable: false, className: 'hidden xl:table-cell' },
  { key: 'portalAccess', sortable: true, className: 'hidden md:table-cell' },
] as const satisfies ReadonlyArray<
  ({ key: ClientSort; sortable: true } | { key: 'plan' | 'weeklyProgress'; sortable: false }) & {
    className: string;
  }
>;

export function ClientTable({
  result,
  input,
  filtered,
  locale,
  archived = false,
}: {
  result: ClientListResult;
  input: ListClientsInput;
  filtered: boolean;
  locale: Locale;
  /**
   * Archived rows offer Restore where active ones offer Archive.
   *
   * The archive is not a route of its own any more — it is `/app/clients` with
   * `?status=archived` on it — so this table's own links (its sort headers, its
   * "clear filters" way out) carry that parameter rather than a different
   * `basePath`. Dropping it would sort the archive and land the reader back in
   * the active register.
   */
  archived?: boolean;
}) {
  /** Ridden along by every link this table draws — see `archived`. */
  const statusQuery = archived ? { status: 'archived' } : {};
  const t = useTranslations('clients');
  const tNav = useTranslations('nav');

  /**
   * Where a header points.
   *
   * Clicking the column already in effect flips its direction; clicking any
   * other starts it ascending, because a column you have just chosen to sort by
   * is one you want to read from the top. Sorting always returns to page 1 —
   * page 3 of a differently ordered list is not the same page 3.
   */
  const sortHref = (key: ClientSort) => ({
    pathname: '/app/clients' as const,
    query: {
      ...statusQuery,
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
      No vertical scroll of its own, at any width. It used to take a bounded
      height from the page and scroll its rows inside it, which is the right
      construction for a long table — and this one is no longer long. A page is
      as many rows as the register's frame holds, measured on the screen it is
      being read on (see `FitRows`), so a frame around *this* would be a
      scrollbar on a list with nothing below the fold. The pager is what moves
      you through the register now.

      Each row carries `data-fit-row`, which is what that measurement counts in.

      `TableRoot` keeps its own `overflow-x-auto`: that is the sideways scroll
      a wide table needs on a phone, and it is untouched by any of this.

      `TableHeader sticky` stays too, and now pins to the app shell rather than
      to a frame here — the same thing it already did below `md`. On a short
      window where a full page of rows does not fit, the page scrolls as one and
      the column names ride along at the top of it.
    */
    <TableRoot data-guide="clients-table">
      <Table>
        <TableHeader sticky>
          <TableRow>
            {COLUMNS.map((column) => {
              // Plain text, no link and no `aria-sort` — see the note on
              // `COLUMNS` for why this one column cannot be ordered by.
              if (!column.sortable) {
                return (
                  <TableHead key={column.key} className={column.className}>
                    {t(`fields.${column.key}`)}
                  </TableHead>
                );
              }

              const active = input.sort === column.key ? input.dir : false;

              return (
                <TableHead key={column.key} sorted={active} className={cn('p-0', column.className)}>
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
            <TableHead className="hidden text-end sm:table-cell">
              <span className="sr-only">{t('fields.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/*
            An empty list is still this table.

            It used to replace the whole thing with a dashed card carrying one
            sentence — which is a different object on the screen from the one
            that was there a moment ago, and on the archive it was the *only*
            thing: a lone box floating under the header with no column names
            above it and no way to tell what you were looking at an empty
            version of. Switching between the register and the archive swapped
            the table for a card and back, so the toggle read as going
            somewhere rather than as changing what the table shows.

            The columns stay, and the message sits in the body under them, which
            is what says "this list, with nothing in it" instead of "no list".
            `colSpan` counts every column including the actions head, so the
            row spans the table at any width — the hidden ones cost nothing.
          */}
          {result.items.length === 0 ? (
            <TableEmpty colSpan={COLUMNS.length + 1}>
              <div className="flex flex-col items-center gap-4">
                <p>{filtered ? t('emptyFiltered') : archived ? t('archive.empty') : t('empty')}</p>

                {/* An empty list with no way out is a dead end; offer the next
                    step — except in the archive, where an empty archive is
                    nothing to act on. */}
                {filtered ? (
                  <Link
                    href={{ pathname: '/app/clients', query: statusQuery }}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    {t('clearFilters')}
                  </Link>
                ) : archived ? null : (
                  <ClientFormTrigger
                    locale={locale}
                    className={buttonVariants({ variant: 'default', size: 'sm' })}
                  >
                    {t('new')}
                  </ClientFormTrigger>
                )}
              </div>
            </TableEmpty>
          ) : null}

          {result.items.map((client) => (
            /* `data-fit-row` is what the register's page size is measured
               against — one of these is one unit of the list. See `FitRows`. */
            <TableRow key={client.id} linked data-fit-row>
              {/*
                Who this is: the disc, the name, and the number under it. One
                cell rather than three, so the three parts of an identity move
                together and the row has a single place the eye starts from.
              */}
              <TableCell>
                <div className="flex items-center gap-3">
                  {/*
                    The client's calendar colour — the same disc their record
                    header, the booking picker and every appointment block draw
                    them in. A hue that changed between screens would be worse
                    than no disc at all, and this is the screen you *find* a
                    person on before going anywhere else.

                    `.patient-tone` builds the ramp from the one hue
                    `patientToneStyle` sets; `contents` keeps the wrapper out of
                    the flex row's own layout, so the span is a scope for the
                    variables and nothing else. The component is `aria-hidden`:
                    the name it stands for is right beside it, and announcing
                    both says the person twice.
                  */}
                  <span className="patient-tone contents" style={patientToneStyle(client.seq)}>
                    <Avatar name={client.fullName} color="var(--tone-mark)" />
                  </span>

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
              <TableCell className="hidden tabular md:table-cell">
                <Age dateOfBirth={client.dateOfBirth} />
              </TableCell>

              {/*
                Where this person stands in the planner — the one column here
                that earns a chip, because it is the only one whose value
                actually differs down the page. See `PlanBadge`.
              */}
              <TableCell className="hidden lg:table-cell">
                <PlanBadge status={client.latestPlanStatus} />
              </TableCell>

              {/*
                And whether they are keeping to it — the same weekly figure
                their own portal shows them. See `WeeklyProgress`.
              */}
              <TableCell className="hidden xl:table-cell">
                <WeeklyProgress
                  progress={client.weeklyProgress}
                  hasPortalAccess={client.hasPortalAccess}
                  locale={locale}
                />
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
              <TableCell className="hidden md:table-cell">
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
              <TableCell className="relative hidden sm:table-cell">
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
                  {/*
                    Drawn the way a Bills row draws its own icons — grey at
                    rest, the brand green with a faint fill under the pointer.
                    `ROW_ACTION_CLASS` is that treatment, and it is imported
                    rather than restated so the two registers cannot drift into
                    two answers for the same question; see its note for why a
                    column of these must not wear the brand colour at rest.

                    They were `neutralGhost`, which draws its label in
                    `text-foreground` — the body ink. At the end of every row of
                    a full register that is a column of near-black marks
                    competing with the names beside them, which is the reading
                    `text-muted-foreground` gives back.

                    **`rounded-full` after it, and deliberately.** The shared
                    class ends in `rounded-sm`, which is right for the 48px
                    icons it was written for and wrong here: these are the 40px
                    circles the note above this row describes. Colour is what is
                    being borrowed, not the shape — tailwind-merge takes the
                    last radius in the list.
                  */}
                  <TooltipHint label={tNav('weeklyPlans')}>
                    <Link
                      href={`/app/weekly-plans/${client.id}`}
                      aria-label={tNav('weeklyPlans')}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                        ROW_ACTION_CLASS,
                        'rounded-full',
                      )}
                    >
                      <Icon name="weeklyPlans" className="size-5" />
                    </Link>
                  </TooltipHint>

                  <TooltipHint label={t('edit')}>
                    <ClientFormTrigger
                      locale={locale}
                      clientId={client.id}
                      aria-label={t('edit')}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                        ROW_ACTION_CLASS,
                        'rounded-full',
                      )}
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
 * There is no `archived` case because this never receives one: `listClients`
 * rules archived plans out before ranking, so a client is described by the
 * newest plan that still stands. This used to fold archived into `none`, which
 * read correctly for a client whose only plan was archived but hid one whose
 * newest week was archived over an earlier week still in draft — that person
 * has work outstanding, and the register said they had nothing. `LivePlanStatus`
 * is what makes the omission a guarantee rather than a missing branch.
 */
function PlanBadge({ status }: { status: LivePlanStatus | null }) {
  const t = useTranslations('clients');

  if (status === 'published') return <Badge variant="onTrack">{t('plan.published')}</Badge>;
  if (status === 'draft') return <Badge variant="incomplete">{t('plan.draft')}</Badge>;

  return <Badge variant="muted">{t('plan.none')}</Badge>;
}

/**
 * How closely this client has followed the plan they are currently on.
 *
 * ## The period belongs to the client, not to the calendar
 *
 * The window is the seven days of *their* plan, counted from its
 * `week_start_date`, and it rolls over when that plan period ends. Two clients
 * of the same clinic can therefore be six days apart in their own cycles and
 * each is judged on their own, which is the only reading that means anything
 * when plans do not all start on the same weekday. See `weeklyProgressByClient`
 * for how the current plan is chosen — the rule is the portal's, not a second
 * guess at it.
 *
 * This column briefly measured a Sunday-to-Saturday calendar week instead,
 * which quietly reset every client's figure at the same midnight regardless of
 * when their plan began. That was wrong for every client whose plan does not
 * start on a Sunday.
 *
 * ## The arithmetic is the portal's own
 *
 * `averageFraction` comes from `summariseAdherenceRun` in
 * `portal/adherence.ts` — the same function, over the same table, behind the
 * ring and the flame strip on the client's progress tab. The register hands it
 * the plan's dates where the portal hands it a calendar week; nothing else
 * differs, and nothing is recomputed here.
 *
 * ⚠ Because the two pass different date runs, this figure and the one on the
 * client's own progress tab **can legitimately disagree** whenever a plan does
 * not align to Sunday. That is intended — a dietitian asking "is this person
 * keeping to the plan I set" and a client asking "how has my week gone" are not
 * the same question — but it is worth knowing before treating a mismatch as a
 * bug.
 *
 * ## Why a meter and not a badge
 *
 * The two chips already on this row — Plan and Portal — mark *states*, which is
 * what the design system reserves a filled pill for. This is a quantity, and a
 * third pill beside them would make the row read as three equal facts when one
 * of them is a measurement. A track is the shape the eye can compare down a
 * column of nine without reading a single digit, which is exactly the job:
 * "who is slipping this week" should be answerable by scanning, not by
 * arithmetic.
 *
 * A circular version of this was tried and taken back out. It measured the same
 * thing and was no clearer for it: a bar's length is read against its
 * neighbours in the column above and below, which is precisely the comparison
 * this cell is for, while nine rings each answer only for themselves.
 *
 * ## One colour, deliberately
 *
 * Gold (`tone="measure"`, `--viz-progress`) at every value — never amber below
 * some line, never clay. Adherence is a continuum with no clinical threshold
 * behind it, and a register where half the rows wear a warning colour on a
 * Wednesday morning teaches the reader that the colour means "this clinic has
 * clients" rather than "look here" — the same trap `PlanBadge` above spells
 * out. The figure and the bar's own length carry the difference; colour is not
 * asked to.
 *
 * Gold rather than the olive this started with, and it turns out to be the more
 * correct reading of the design system rather than a departure from it: olive
 * is the action colour, and `viz-brand`'s own note says data is not an action.
 * The bar now sits in its own register, unmistakable against the olive Plan and
 * Portal chips on the same row.
 *
 * ## Three kinds of nothing
 *
 * An empty cell is never drawn as 0%. `adherence.ts` keeps unreported days out
 * of its averages precisely so that silence is never scored, and a zero here
 * would accuse someone of abandoning a plan they may be following perfectly.
 * The three real causes are separated in the branches below, in the order a
 * reader would want them.
 */
function WeeklyProgress({
  progress,
  hasPortalAccess,
  locale,
}: {
  progress: ClientWeeklyProgress | null;
  hasPortalAccess: boolean;
  locale: Locale;
}) {
  const t = useTranslations('clients');

  /*
    No portal account: the client has no way to tick a meal at all. Checked
    before the period, because creating their plan seeded a `missed` row for
    every one of its days — so the arithmetic below would report a truthful-
    looking 0% for someone who was never given a way to log anything. That is
    the one reading this column must not produce.
  */
  if (!hasPortalAccess) return <NoProgress label={t('progress.ariaNoTracking')} />;

  // No published plan covers today, so there is no period to measure over.
  if (!progress) return <NoProgress label={t('progress.ariaNoPlan')} />;

  /*
    A period is running but nothing in it has been recorded yet, so there is no
    figure to draw — the same nothing as the two branches above, and it is drawn
    the same way rather than as a track sitting at zero. The day count stays:
    unlike the two above, this cell knows how long the period is and how much of
    it has been kept, and "0 of 7 days" is a fact rather than a placeholder.
  */
  if (progress.averageFraction === null) {
    return (
      <NoProgress
        label={t('progress.ariaEmpty', { total: progress.periodDays })}
        note={t('progress.daysCompleted', {
          completed: progress.fullyCompletedCount,
          total: progress.periodDays,
        })}
      />
    );
  }

  const percentLabel = formatNumber(locale, progress.averageFraction, { style: 'percent' });

  return (
    /*
      `Progress` from the shared library rather than a hand-drawn track: Base
      UI's root is what supplies `role="progressbar"` and `aria-valuenow`, and
      its indicator sizes itself with `width` off `inset-inline-start`, which is
      a logical property and so fills from the correct edge in Arabic without
      this file knowing the direction.

      The root is `flex flex-wrap`, so the two spans take the first line and the
      full-width track wraps onto the second — a two-line cell the same height
      as the name cell beside it, which is what keeps the row from growing.
    */
    <Progress
      /*
        `value` is 0–100; the fraction is 0–1. One multiplication, here, at the
        only place the two scales meet.

        Never null by this point: a period with nothing recorded has already
        returned above, so every track this branch draws is a real measurement.
      */
      value={progress.averageFraction * 100}
      // A quantity, not an action — see `INDICATOR_TONE` on the component.
      tone="measure"
      // Both spans are `aria-hidden`, so this is the whole cell as a screen
      // reader receives it.
      aria-label={t('progress.aria', {
        percent: percentLabel,
        completed: progress.fullyCompletedCount,
        total: progress.periodDays,
      })}
      className="w-full max-w-32 gap-x-2 gap-y-1.5"
    >
      <span aria-hidden className="tabular text-body-sm font-medium">
        {percentLabel}
      </span>

      {/*
        Days kept in full, out of the plan period's own length — not out of
        seven, because the period is the plan's and a plan is not obliged to be
        a calendar week.

        `fullyCompletedCount` rather than `recordedCount`, and the difference is
        not cosmetic: almost every elapsed day of a live plan *has* a row, since
        creating the plan seeds one per day, so a "days recorded" count would
        read as the number of days that have passed and tell the dietitian
        nothing. Days kept in full is the count that moves only when the client
        does something.

        `ms-auto` pushes it to the cell's far edge — logical, so it lands on the
        correct side in both directions.
      */}
      <span aria-hidden className="tabular ms-auto text-caption text-muted-foreground">
        {t('progress.daysCompleted', {
          completed: progress.fullyCompletedCount,
          total: progress.periodDays,
        })}
      </span>
    </Progress>
  );
}

/**
 * The progress cell with nothing to measure: a dash, and no track at all.
 *
 * ## Why the empty track went
 *
 * It used to draw the same bar as a measured cell, sitting at zero — the
 * argument being that a column where every row carries a bar is a column you
 * can scan. What it actually produced was a grey capsule under a dash on every
 * row of a quiet register, which is the exact shape of a loading skeleton: the
 * reader's first reading of the column was "this has not finished loading",
 * and their second was "these people are at 0%" — the one accusation this cell
 * exists to avoid making.
 *
 * A track is a *quantity*, so it is drawn only where there is one. Absence gets
 * the mark the rest of this table already uses for it — the muted em dash of
 * {@link Missing}, the same one an unrecorded phone number or an unbelievable
 * birth date gets — so an empty cell here reads as the same kind of nothing as
 * an empty cell anywhere else on the row, rather than as a bar that failed.
 *
 * The column still scans, and arguably better: what the eye now picks out is
 * the rows that *have* a gold bar, instead of a page of identical grey ones
 * with a few gold ones among them.
 *
 * ## Why it says nothing about why
 *
 * It used to render a `muted` badge naming the cause — "No active plan", "No
 * tracking". Both were wrong to put here, for the same underlying reason: this
 * column's job is to report progress, and every explanation for its absence is
 * already a column of its own on the same row.
 *
 * "No active plan" was the worse of the two, because it did not merely repeat
 * the Plan column — it **contradicted** it. `latestPlanStatus` means "this
 * client's newest plan is published", which is not the same question as "a
 * published plan covers today": a plan published for last week, or for a week
 * still ahead, satisfies the first and fails the second. So a row could read
 * `Active plan` beside `No active plan` and be telling the truth twice. A
 * reader has no way to resolve that, and nothing here should ask them to.
 *
 * "No tracking" had the milder version of the same fault, restating the Portal
 * column one cell over.
 *
 * So the cell draws an empty track and stops. The column stays uniform — every
 * row carries a bar, which is what makes it scannable — and the reason lives
 * where the reader is already looking for it.
 *
 * The reason is not lost, only unspoken: it rides on the bar's accessible name,
 * so a screen reader is told which of the two absences this is rather than
 * being handed a silent zero.
 */
function NoProgress({ label, note }: { label: string; note?: string }) {
  return (
    /*
      The same width and the same first line as a measured cell — the dash sits
      where the percentage sits, and the day count where the day count sits — so
      the column stays aligned down the page. Only the track is missing, which
      is the whole point: there is no quantity to draw one for.
    */
    <span className="flex w-full max-w-32 items-baseline gap-x-2">
      {/*
        The reason, for a screen reader only. The dash is `aria-hidden` and
        always was; without this the cell would be announced as nothing at all,
        where "no plan is running" and "this client cannot log anything" are two
        different answers and worth keeping.
      */}
      <span className="sr-only">{label}</span>

      <span aria-hidden className="tabular text-body-sm font-medium">
        <Missing />
      </span>

      {/* `ms-auto` to the cell's far edge, logical so it lands correctly in
          both directions — the measured cell's own day count does the same. */}
      {note ? (
        <span aria-hidden className="tabular ms-auto text-caption text-muted-foreground">
          {note}
        </span>
      ) : null}
    </span>
  );
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
