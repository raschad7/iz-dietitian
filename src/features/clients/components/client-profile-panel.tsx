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
import { CLIENT_GOALS, CLIENT_SEXES } from '@/features/clients/schema';
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

  const goal = isMember(CLIENT_GOALS, client.goal) ? client.goal : null;
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
      one gap — `mt-auto` on the actions — so the facts stay at the panel's own
      tight rhythm and the buttons sit at its floor, which is where a panel's
      action belongs anyway.

      `min-h-0` plus the scrolling content is the other direction: a long name or
      a short viewport makes this column taller than the row, and without it the
      card would grow past the record shell's floor and take the page's own
      scrollbar with it.
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
            The goal, where the template puts the user's role — and only when
            there is one, because a chip reading "—" is a chip with nothing to
            say. An archived record shows that instead: it is a state a reader
            has to notice before editing anything, and it outranks the goal.
          */}
          {archived ? (
            <Badge variant="muted" className="mt-1.5">
              {t('status.archived')}
            </Badge>
          ) : goal ? (
            <Badge variant="muted" className="mt-1.5">
              {t(`goal.${goal}`)}
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

          <dl className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-body-sm text-muted-foreground">{row.label}</dt>

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
                    'flex min-w-0 items-center justify-end gap-2 text-end text-body-sm font-medium',
                    row.numeric && 'tabular-nums',
                    row.value === null && 'font-normal text-muted-foreground',
                  )}
                >
                  {row.status ? (
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        archived ? 'bg-muted-foreground' : 'bg-primary',
                      )}
                    />
                  ) : null}
                  <bdi className="truncate">{row.value ?? t('notProvided')}</bdi>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/*
          Edit and the overflow menu, at the foot of the column they act on. They
          were on the breadcrumb line a row above the tab bar, which put the two
          controls that change a record as far from the record as the page
          allows. What was here instead was a link to the plan board — a good
          button on the wrong panel; see `ClientRecordActions`.
        */}
        <ClientRecordActions
          clientId={client.id}
          clientName={client.fullName}
          archived={archived}
          locale={locale}
          /* The panel's floor from `lg` up; below it the column is at natural
             height and `mt-auto` would push nothing anywhere. */
          className="lg:mt-auto"
        />
      </CardContent>
    </Card>
  );
}
