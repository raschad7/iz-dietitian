import { Fragment } from 'react';

import { getFormatter, getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { patientToneStyle } from '@/features/booking/patient-color';
import { ClientRecordActions } from '@/features/clients/components/client-record-actions';
import { calculateAge } from '@/features/clients/age';
import { type ClientDetail } from '@/features/clients/queries';
import { CLIENT_SEXES } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { isMember } from '@/lib/enum';
import { cn } from '@/lib/utils';

/**
 * Who this patient is — the panel that does not move.
 *
 * The `users/view` template's left panel, carrying this product's facts. It sits
 * beside all five of the profile's views rather than inside any of them, because
 * the answer to "who am I looking at" must not depend on which tab happens to be
 * open: switching from Notifications to Connections changes the subject of the
 * page, and losing the name while it does is how a reader ends up editing the
 * wrong record.
 *
 * ## What it holds, and what it deliberately does not
 *
 * **The reference facts, once.** Phone, email, status, sex, age, the day the
 * record was opened, and whether there is a portal sign-in — the template's
 * eight-row detail list, mapped onto the columns this record actually has.
 *
 * Correspondence language was among them and is not any more. It is the one row
 * that answers a question nobody asks of a *patient*: it steers which language
 * their portal and their reminders arrive in, which is a setting, and it read as
 * a fact about the person beside their age and their phone number.
 *
 * They are **values, not controls**. Calling, messaging and copying live one
 * column over on the Connections view, where a channel is the subject rather
 * than a fact about a person, so this panel never grows a second set of
 * affordances for the same phone number.
 *
 * **The clinical record is not here.** Height, weight, targets, allergies and
 * the meal schedule belong to the Nutrition tab; repeating any of them beside
 * all five views would make this a worse copy of a screen that exists, which is
 * the mistake the record header was cut back for.
 *
 * ## The actions
 *
 * Edit, and the overflow menu holding archive and delete — the template's own
 * Edit-and-Suspend pair, with this record's second control in place of a suspend
 * it does not have. They were on the breadcrumb line above the tab bar, and
 * before that in a record header; they belong here, at the foot of the column
 * they act on.
 *
 * What they replaced was a link to the plan board. See `ClientRecordActions`.
 *
 * A server component. The edit dialog and the menu bring their own client
 * boundaries.
 */
export async function ClientProfilePanel({
  client,
  locale,
  visitCount,
  planCount,
}: {
  client: ClientDetail;
  locale: Locale;
  /** Appointments already behind them — the count the record is read for. */
  visitCount: number;
  /** Weeks written for this client, live and historical. */
  planCount: number;
}) {
  const [t, format] = await Promise.all([getTranslations('clients'), getFormatter()]);

  const sex = isMember(CLIENT_SEXES, client.sex) ? client.sex : null;
  const age = client.dateOfBirth ? calculateAge(client.dateOfBirth) : null;
  const archived = client.status === 'archived';

  const rows = [
    // The first two are read left-to-right whatever the page's direction is,
    // which is what `numeric` sets the figures for — see the `<bdi>` note below.
    { label: t('fields.phone'), value: client.phone, numeric: true },
    { label: t('fields.email'), value: client.email, numeric: true },
    {
      label: t('fields.status'),
      value: t(`status.${archived ? 'archived' : 'active'}`),
      status: true,
    },
    { label: t('fields.sex'), value: sex ? t(`sex.${sex}`) : null },
    { label: t('fields.age'), value: age === null ? null : t('yearsOld', { count: age }) },

    {
      label: t('fields.createdAt'),
      value: format.dateTime(client.createdAt, { dateStyle: 'medium' }),
    },
    {
      label: t('fields.portalAccess'),
      value: t(`portal.${client.hasPortalAccess ? 'granted' : 'none'}`),
    },
  ];

  return (
    /*
      **The full height of the row, and the spare height goes to one place.**

      It has been all three ways now, and the difference is where the leftover
      vertical space ends up. `justify-between` shared it out between every
      block, which drifted the avatar, the counts, the details and the buttons a
      finger apart on a tall screen. `self-start` shrank the card to its content
      and left the gap under it, which made the column look half-drawn beside a
      full-height views panel. This fills the row and gives the whole surplus to
      the scroll port, so the facts stay at the panel's own tight rhythm and the
      actions sit at its floor, which is where a panel's action belongs anyway.

      **The card is the flex column and it has exactly two children**: the facts,
      which take the free height and scroll inside it, and the actions, which are
      `shrink-0` and therefore always on screen. The surplus — and the deficit —
      both land on the first one. See the note above the actions for what this
      arrangement replaced and why `mt-auto` could not do it.

      `min-h-0` is what allows the deficit: a long name or a short viewport makes
      this column want to be taller than the row, and without it the card would
      grow past the record shell's floor and take the page's own scrollbar with
      it instead of scrolling its own facts.
    */
    <Card size="sm" className="lg:flex lg:min-h-0 lg:flex-col">
      <CardContent className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
        <div className="flex flex-col items-center text-center">
          {/*
            The patient's calendar colour — the disc heading this panel is the
            one their appointments are drawn in, so the person picked out of the
            register is recognisably the person now on screen. See
            `features/booking/patient-color`.
          */}
          <span className="patient-tone contents" style={patientToneStyle(client.seq)}>
            <Avatar name={client.fullName} color="var(--tone-mark)" size="xl" />
          </span>

          <h2 className="mt-2 font-heading text-heading-sm font-semibold" dir="auto">
            {client.fullName}
          </h2>

          {/*
            Archived, and nothing else.

            **The goal used to sit here too**, where the template puts the user's
            role, shown whenever the record was not archived. It is a tile on the
            Nutrition card now — beside النشاط, and beside the calorie target the
            two of them produce, which is the one place on the record where a
            goal explains something rather than just being stated.

            ⚠ The cost is real and worth knowing: the goal appeared beside *every*
            view from here, and it now appears on one. Open Progress or Visits
            and the record no longer says what this client is working towards.
            That was the deliberate trade — it was the same fact drawn twice on
            one screen — but if it is wanted back, this is where it went.

            Archived stays, and stays a badge: it is a state a reader has to
            notice before editing anything, which is exactly what this system
            spends a filled pill on.
          */}
          {archived ? (
            <Badge variant="muted" className="mt-1.5">
              {t('status.archived')}
            </Badge>
          ) : null}
        </div>

        {/*
          The template's "Task Done / Project Done" pair, as the two counts a
          clinical record has: two cards side by side, the way the template draws
          them.

          `variant="tile"` rather than a real `Card`, because these sit *inside*
          one — a card in a card would stack two fills, two rings and two shadows
          on the same 130px box. The tile is this system's answer to that: a
          rounded muted fill, its own padding, no elevation. See
          docs/design-system.md on nesting.

          The glyph is bare on that fill rather than on a disc, and it is a
          neutral: olive marks what you can act on, and the only thing in this
          panel you can press is the button at its foot.
        */}
        <div className="flex gap-3">
          {[
            { icon: 'calendar' as const, label: t('profile.visitsSoFar'), value: visitCount },
            { icon: 'mealPlans' as const, label: t('profile.plansWritten'), value: planCount },
          ].map((figure) => (
            <Card
              key={figure.label}
              variant="tile"
              className="min-w-0 flex-1 items-center gap-0.5 p-2.5 text-center"
            >
              <Icon name={figure.icon} className="size-[1.125rem] text-muted-foreground" />
              {/* The figure is isolated LTR so digits keep their order inside
                  Arabic, while the label under it stays in the page's direction. */}
              <span
                dir="ltr"
                className="font-heading text-heading-sm font-semibold tabular-nums"
              >
                {figure.value}
              </span>
              <span className="max-w-full truncate text-caption text-muted-foreground">
                {figure.label}
              </span>
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-body-sm font-semibold">{t('profile.details')}</h3>
          <Separator />

          {/*
            ⚠ **A two-column grid, not a row per fact.**

            Each row used to be its own `flex justify-between`, which pushed the
            value to the *far* edge of that row — so every value hung off the
            panel's opposite margin and the column they formed was aligned by
            the panel's edge rather than by anything to do with the values. A
            two-word answer like 'ذكر' ended up a long way from the label naming
            it, with nothing in between.

            `grid-cols-[auto_minmax(0,1fr)]` gives the labels a column exactly as
            wide as the longest of them and the values everything after it, so
            **both columns have a straight edge** and every value begins at the
            same place — beside its label rather than across the panel from it.
            `text-start` is what puts the value at the reading edge of its own
            column: right in Arabic, left in English, from one class.

            `dt`/`dd` are the grid items directly. A `div` per row would make the
            row the grid item and put the two columns back inside it, which is
            the arrangement being replaced.

            `mt-1.5` on top of the wrapper's `gap-2`, so the rule under
            'التفاصيل' clears the first row by 14px rather than 8. The heading
            and its rule are one unit and belong close together; the list under
            them is a different thing and was sitting as near the rule as the
            rule sat to the heading, which made the three read as one stack
            instead of a titled section.

            ⚠ **`gap-x-24` is the only lever on how far in the values sit**, and
            it is measured rather than chosen for looking round. The label column
            is `auto`, so it is exactly as wide as the longest label —
            `البريد الإلكتروني` — and a value cannot begin before that ends. The
            gap is therefore the whole of the adjustment.

            **It is also why the panel's track is `23rem` and not the `17.5rem`
            it started at.** The binding constraint is the widest value,
            `+9705435435454`, at about 115px of tabular digits. On the original
            280px track the values had roughly 11px of slack, so every step out
            broke a phone number across two lines; the track has been widened
            three times — 17.5 → 19 → 21 → 23rem — and every pixel of it went
            into this gap, which has gone 12 → 40 → 72 → 96px. The values now sit
            96px clear of the labels with about 135px left to render in.

            **This is the last step this approach has in it.** Widening the track
            again to buy another 24px starts charging the record's own views for
            a gap in a sidebar. If the values must go further left, the fix is
            structural: give `phone` and `email` their own full-width rows, label
            above value, and the binding constraint drops from a 115px phone
            number to a 75px date — which frees far more than another `gap-x`
            step ever will.
          */}
          <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-24 gap-y-1.5">
            {rows.map((row) => (
              <Fragment key={row.label}>
                <dt className="text-body-sm text-muted-foreground">{row.label}</dt>

                {/*
                  `<bdi>` isolates the value's own direction rather than `dir` on
                  the cell: a phone number or a Latin email inside an Arabic page
                  keeps its internal order while the row stays aligned the way
                  the page is. `dir="auto"` here would resolve the whole cell LTR
                  and drag its alignment to the wrong edge — the trap documented
                  under "RTL" in docs/design-system.md.
                */}
                <dd
                  className={cn(
                    'flex min-w-0 items-center gap-2 text-start text-body-sm font-medium',
                    row.numeric && 'tabular-nums',
                    row.value === null && 'font-normal text-muted-foreground',
                  )}
                >
                  {/*
                    ⚠ **`wrap-anywhere`, not `truncate`.**

                    A phone number and an email are the two facts on this panel
                    that someone reads in order to *use* them, and they are the
                    two longest strings on it. `truncate` cut both: at 320px
                    inside the staff shell the panel is 264px wide, the label
                    takes its share of that, and an ordinary address —
                    `rashad.abdulrahman@gmail.com` — lost 81px to an ellipsis.
                    Truncating the one row a reader came to the panel for is the
                    wrong failure, and it is not only a phone problem: the `lg`
                    column is a fixed `17.5rem`, so the same address is cut on a
                    desktop too.

                    `overflow-wrap: anywhere` breaks the string only when it does
                    not fit, and — unlike `break-word` — it lets the value shrink
                    below its longest token, which is what keeps the row from
                    pushing the panel wider than its column. A long address takes
                    a second line; nothing is lost. `min-w-0` because this is a
                    flex item and its automatic minimum would otherwise be the
                    string's own width.
                  */}
                  {/*
                    ⚠ **The status dot leads the word — it is the first child,
                    so in Arabic it sits to the right of 'نشِط' and is read
                    first.** Flex order follows the document direction, which is
                    what makes one child order correct in both languages: the
                    mark comes before the word it marks in Arabic and in English
                    alike, with nothing about it pinned to a physical side.

                    It was briefly trailing, to keep the column's text edge dead
                    straight — a leading dot costs this one row 16px of indent
                    that the other six do not pay. That was the wrong thing to
                    optimise: a status mark that arrives after the status has
                    already been read is decoration, and one pixel-perfect edge
                    is not worth it.

                    `aria-hidden`, because the word beside it already says
                    'active'; an unlabelled dot announced next to it would be
                    saying so twice.
                  */}
                  {row.status ? (
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        archived ? 'bg-muted-foreground' : 'bg-primary',
                      )}
                    />
                  ) : null}

                  <bdi className="min-w-0 wrap-anywhere">{row.value ?? t('notProvided')}</bdi>
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </CardContent>

      {/*
        ⚠ **Edit and the overflow menu are outside the scroll port, on purpose.**

        They were the last children *inside* it, held down by `lg:mt-auto`. That
        works only while everything above them fits: from `lg` up this panel is a
        bounded box and its content scrolls, so as soon as the facts were taller
        than the column the buttons went under the fold with them. `mt-auto`
        cannot pin anything to a viewport — it pushes to the bottom of the
        *content*, and the content is precisely what had grown too tall.

        **Browser zoom is what makes it certain rather than occasional.** Zooming
        in shrinks the layout viewport in CSS pixels while every row keeps its
        size in them, so the same panel that fitted at 100% overflows at 150% —
        and the record's only primary action was clipped by the card's own
        `overflow-hidden`, or gone entirely. A control that disappears when a
        reader makes the text bigger is an accessibility failure, not a
        cosmetic one.

        As a sibling of the scrolling `CardContent` it is a flex child of the
        card itself: `shrink-0`, so it keeps its height whatever happens above,
        and always on screen. The facts scroll under it.

        The hairline is `lg` only — it marks the edge of the scroll port, and
        below `lg` there is no scroll port to mark, just a column at its natural
        height.
      */}
      <div className="shrink-0 px-(--card-spacing) lg:border-t lg:border-border lg:pt-4">
        <ClientRecordActions
          clientId={client.id}
          clientName={client.fullName}
          archived={archived}
          locale={locale}
        />
      </div>
    </Card>
  );
}
