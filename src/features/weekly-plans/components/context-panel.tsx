import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { patientToneStyle } from '@/features/booking/patient-color';
import { IntakeFormTrigger } from '@/features/clients/components/intake-form-trigger';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { isMember, membersOf } from '@/lib/enum';
import { cn } from '@/lib/utils';

import type { ClientContext, PlannableClient } from '../queries';
import { ALLERGENS } from '../schema';

import { ClientPicker } from './client-picker';

/**
 * The client facts needed while planning, as the board header's first row and
 * the line under it.
 *
 * ── Two siblings, not one box ──
 *
 * `embedded` — which is how both boards use this — returns the client row and
 * the line of figures as a fragment, for the header's own grid to place.
 *
 * They used to be one `section` sitting in the *first column* of that grid,
 * which is the card's width less whatever the action bar was taking: about
 * 26rem at 768px, for five label-and-value pairs that need thirty-eight. So
 * they wrapped, and the allergy fact — the one that matters most and reads last
 * — spent a line of the header on its own. As siblings the figures get a row of
 * their own that runs the full width of the card, and they fit on it at every
 * width the board is used at.
 *
 * The placement lives in `plan-board.tsx` and `empty-plan-board.tsx`, which are
 * grids of the same shape. Nothing here says which column anything is in beyond
 * the one thing that is this component's own business: that from `2xl` the
 * figures have room to move up beside the client instead of under them.
 *
 * `2xl` and not `xl` for that, because the five of them need about 41rem in
 * Arabic and the client column and the action bar need 40rem between them. A
 * 1280px laptop with the staff rail beside it has about 74rem of card, which is
 * four short — and being four short does not look like a layout that does not
 * quite fit, it looks like five values that have all been cut off. The row of
 * its own is the readable answer at that width; the third column is for the
 * screens that really have room for it.
 */
export function ContextPanel({
  context,
  clients,
  locale,
  embedded = false,
}: {
  context: ClientContext;
  clients: readonly PlannableClient[];
  locale: Locale;
  embedded?: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const tGoals = useTranslations('clients.goal');
  const tActivity = useTranslations('clients.activity');
  const { targets, profile } = context;

  const allergenTags = profile ? membersOf(ALLERGENS, profile.allergenTags) : [];
  const allergyText = [
    ...allergenTags.map((tag) => t(`allergens.${tag}`)),
    context.allergies?.trim(),
  ]
    .filter(Boolean)
    .join('، ');

  const notes = [
    { key: 'permanentInstructions', label: t('permanentInstructions'), body: profile?.permanentInstructions },
    { key: 'preferences', label: t('preferences'), body: profile?.preferences },
    { key: 'dislikes', label: t('dislikes'), body: profile?.dislikes },
    { key: 'medicalNotes', label: t('medicalNotes'), body: context.medicalNotes },
  ] as const;

  /*
    Split rather than rendered uniformly — see the note in the popover. `trim()`
    because a field someone opened, spaced and saved is empty in every sense the
    reader cares about, and a heading over a blank line is the worst of both
    renderings.
  */
  const written = notes.filter((note) => Boolean(note.body?.trim()));
  const blank = notes.filter((note) => !note.body?.trim());

  const measurements = [
    profile?.weightKg !== null && profile?.weightKg !== undefined
      ? t('kg', { value: profile.weightKg })
      : null,
    context.heightCm !== null ? t('cm', { value: context.heightCm }) : null,
    context.age !== null ? t('years', { value: context.age }) : null,
  ].filter((entry): entry is string => entry !== null);
  const selectedClient = clients.find((client) => client.id === context.clientId);

  const identity = (
    <div className="flex min-w-0 items-center gap-2">
      {/*
        The client's calendar colour — the disc heading the week being planned is
        the one their appointments are drawn in. See `patient-color.ts`;
        `contents` keeps this scope out of the row's own layout.
      */}
      {selectedClient ? (
        <span className="patient-tone contents" style={patientToneStyle(selectedClient.seq)}>
          {/* `lg` (44px), not `planner` (56px). That size exists to match a row
              of fact tiles, and the facts are a line of text now — a 56px disc
              would be the one thing left setting the old height. */}
          <Avatar name={selectedClient.fullName} color="var(--tone-mark)" size="lg" />
        </span>
      ) : null}

      {/*
        `max-w-72`, where this was `flex-1` with no ceiling.

        The picker is a borderless control whose copy is the client's name, and
        given the whole column it took it — a 550px box with the name adrift in
        the middle of it and the chevron a hand's width away at the far end. It
        is a name, not a field: it needs the width a name needs. Capped here and
        start-aligned in `client-picker.tsx`, it reads as the caption to the disc
        it sits against.

        `min-w-40` and not `min-w-44` for the floor, because that floor is what
        the client column's own minimum is built out of and every 16px of it is
        16px the five figures beside it do not have on a 1280px laptop. 10rem
        holds a name at 20px with its chevron and still leaves the row nothing
        to complain about.

        ⚠ **The floor starts at `md`, and it has to.** It was unconditional, and
        that made this row 322px wide at its narrowest — 44px of disc, a 160px
        floor, and the 96px control pill at the end of it. The board header is
        `overflow-hidden`, and a 375px phone gives the row 293px: the 29px that
        did not fit was the end of that pill, so on an iPhone the button that
        creates a client's nutrition profile was cut in half and the one behind
        it was gone. Clipped, with the scrollbars hidden app-wide, means there is
        no wheel, no drag and no gesture that reaches it.

        Below `md` the picker keeps `min-w-0` and shrinks instead. It loses
        nothing by it: the name inside truncates already (see `ClientPicker`),
        and a truncated name beside a reachable control beats a whole name beside
        a control that is not there.
      */}
      <div className="max-w-72 min-w-0 flex-1 md:min-w-40">
        <ClientPicker clients={clients} selectedClientId={context.clientId} appearance="bar" />
      </div>

      {/*
        The two client controls, pushed to the end of their column — which puts
        them against the plan's action bar, so the header carries one strip of
        controls rather than two clusters with a gap of nothing between them.
        Same pill, same gutter and the same 40px squares as that bar; they were
        a shorter pill of round discs, which is the sort of difference that reads
        as an accident.

        Still a pill of their own rather than four more buttons in the action
        bar, because the seam is real: these two open the person, the four beside
        them act on the week.
      */}
      <div className="ms-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-muted/70 p-1">
        <Popover>
          <TooltipHint label={t('planningNotes')}>
            <PopoverTrigger
              aria-label={t('planningNotes')}
              className={cn(buttonVariants({ variant: 'neutral', size: 'sm' }), 'size-10 px-0')}
            >
              <Icon name="info" />
              <span className="sr-only">{t('planningNotes')}</span>
            </PopoverTrigger>
          </TooltipHint>
          {/*
            ── The planning notes, as a panel rather than a printout ──

            What was here was a 13px title with no space under it, a two-column
            `dl` whose second cell had to fit "80 كغ · 170 سم · 28 سنة" in
            150px (it never did — it wrapped mid-run, twice), and four
            hairline-separated rows that mostly said "غير محدد" in exactly the
            weight and colour a real answer would have. Nothing in it was
            wrong; it just had no rhythm, so the eye had nowhere to land and an
            empty profile looked identical to a full one.

            Three changes carry the fix. The heading gets the app's heading face
            and a rule under it, and stays put while the notes scroll — the
            popover is tall enough to scroll and a title that leaves is a
            surface you can lose your place in. The two derived facts become a
            spec list, label at the inline-start and value at the inline-end on
            one row each, which is the shape that gives a long measurement
            string the whole width instead of half of it. And an unanswered note
            drops to the muted colour, so "not recorded yet" reads as absence
            rather than as content.
          */}
          <PopoverContent
            align="end"
            side="bottom"
            className="max-h-[min(34rem,72dvh)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-0"
          >
            <div className="sticky top-0 z-10 border-b border-border bg-popover px-4 py-3">
              {/*
                The title, and nothing under it.

                The client's name was a second line here, 40px from their own
                name in the header and 20px from the avatar the popover opens
                off — three printings of one word inside a hand's width. A
                popover is understood to belong to the control it grew out of;
                it does not have to say whose it is.
              */}
              <PopoverTitle className="font-heading text-body-md font-semibold">
                {t('planningNotes')}
              </PopoverTitle>
            </div>

            <div className="space-y-4 p-4">
              {targets.missing.length > 0 && (
                <p className="rounded-md bg-status-attention-bg px-3 py-2 text-body-sm leading-relaxed text-status-attention-fg">
                  {t('missingFields', {
                    fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
                  })}
                </p>
              )}

              {/*
                ── The allergies first, and as a warning rather than a row ──

                It was the fifth of seven rows in a list of figures, in the same
                type as the activity level, differing only in colour. But it is
                the one fact here that can stop a plan going out, and it is a
                *sentence* rather than a value — it never fitted the
                label-left/value-right shape the other six are built for, so it
                wrapped where they did not and dragged the whole list out of
                rhythm. On its own, at the top, in the medical tone, it is both
                shorter and the first thing read.
              */}
              <p
                className={cn(
                  'rounded-lg px-3 py-2.5 text-body-sm leading-relaxed',
                  allergyText
                    ? 'bg-status-medical-bg text-status-medical-fg'
                    : 'bg-status-attention-bg text-status-attention-fg',
                )}
                dir="auto"
              >
                <span className="font-semibold">{t('allergies')}</span>
                {' · '}
                {allergyText || t('allergiesMissing')}
              </p>

              {/*
                ── Two figures as tiles, five as rows ──

                The seven facts were one undivided run of `dt`/`dd` pairs, which
                is why this panel read as a printout: the calorie target and the
                protein target — the two numbers the whole week is built to hit
                — sat in the same 14px grey as the activity level, and the eye
                had to read all seven to find the two.

                They are tiles now, side by side and set at heading size, and the
                rest keep the list. Two groups with a heading each, so what is a
                *target* and what is a *measurement* is answered by the layout
                rather than by reading the labels.
              */}
              <section>
                <SpecHeading>{t('notesTargets')}</SpecHeading>
                <div className="grid grid-cols-2 gap-2">
                  <Figure label={t('dailyTarget')}>
                    {context.effectiveKcal === null
                      ? t('unset')
                      : t('kcalValue', { value: context.effectiveKcal })}
                  </Figure>
                  <Figure label={t('fields.proteinTargetGrams')}>
                    {context.effectiveProteinGrams === null
                      ? t('unset')
                      : t('grams', { value: context.effectiveProteinGrams })}
                  </Figure>
                </div>
              </section>

              <section>
                <SpecHeading>{t('notesBody')}</SpecHeading>
                {/* The sunken fill the header's own line of figures uses, so the
                    popover reads as the same object opened up rather than as a
                    second design of the same information. */}
                <dl className="divide-y divide-border rounded-lg bg-muted/70 px-3">
                  <SpecRow label={t('goal')}>
                    {isMember(CLIENT_GOALS, context.goal) ? tGoals(context.goal) : t('unset')}
                  </SpecRow>
                  <SpecRow label={t('bmi')}>
                    {targets.bmi === null ? t('unset') : targets.bmi.toFixed(1)}
                  </SpecRow>
                  <SpecRow label={t('activityLevel')}>
                    {isMember(CLIENT_ACTIVITY_LEVELS, context.activityLevel)
                      ? tActivity(context.activityLevel)
                      : t('unset')}
                  </SpecRow>
                  <SpecRow label={t('measurements')}>
                    {measurements.length ? measurements.join(' · ') : t('unset')}
                  </SpecRow>
                </dl>
              </section>

              {/*
                ── Four "not recorded" blocks become one line ──

                Every one of the four written notes was drawn as a label and a
                body whether or not anything had been written, so the common
                case — a client with permanent instructions and nothing else —
                spent about 120px of a scrolling panel on three headings above
                three copies of the word "unset". Which is not information: it
                is the same absence, restated once per field, in the weight and
                spacing a real answer would have had.

                What is written gets its heading and its paragraph. What is not
                is named once, in a muted run at the foot, where it can be
                checked in a glance without being read.
              */}
              <section>
                <SpecHeading>{t('notesWritten')}</SpecHeading>

                {written.length === 0 ? (
                  <p className="text-body-sm text-muted-foreground">{t('notesNothingWritten')}</p>
                ) : (
                  <div className="space-y-3">
                    {written.map((note) => (
                      <div key={note.key}>
                        <p className="text-caption font-medium text-muted-foreground">
                          {note.label}
                        </p>
                        <p
                          className="mt-1 text-body-sm leading-relaxed [overflow-wrap:anywhere]"
                          dir="auto"
                        >
                          {note.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {blank.length > 0 && (
                  <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
                    {t('notesUnwritten', {
                      fields: blank.map((note) => note.label).join('، '),
                    })}
                  </p>
                )}
              </section>
            </div>
          </PopoverContent>
        </Popover>

        {/*
          One control in two states, in one place — the same rule the publish
          button follows.

          Creating the first profile and editing an existing one open the same
          form and mean the same thing to the layout, so they are the same
          button: a plus until there is a profile, a pencil after. It used to be
          two different controls in two different places — a labelled "create
          profile" button wedged in beside the client's name, and a pencil down
          here — so filling in a profile moved a control across the header and
          changed its shape on the way. The header now has one layout, whatever
          state the client is in.
        */}
        <TooltipHint label={profile ? t('editProfile') : t('createProfile')}>
          <IntakeFormTrigger
            locale={locale}
            clientId={context.clientId}
            aria-label={profile ? t('editProfile') : t('createProfile')}
            className={cn(buttonVariants({ variant: 'neutral', size: 'sm' }), 'size-10 px-0')}
          >
            <Icon name={profile ? 'edit' : 'add'} />
            <span className="sr-only">{profile ? t('editProfile') : t('createProfile')}</span>
          </IntakeFormTrigger>
        </TooltipHint>
      </div>
    </div>
  );

  /*
    ── The week's numbers, where there is a line to spare for them ──

    Three short answers — a target, a target, and a warning — read once when the
    screen opens and glanced at while planning. They are reference, not work:
    the daily target is printed under every day name on the board below, and the
    allergy line is the one that can stop a plan going out.

    **BMI and the goal used to be here and are not any more.** Neither is a
    figure anyone acts on while placing meals: the goal already decided the
    calorie target that *is* on the line, and BMI decided nothing on this screen
    at all. They were two of five values competing for a line that only ever had
    room for a few, and dropping them gives the remaining three their full width
    instead of three truncated pairs. Both still live in the notes popover,
    beside the rest of the profile they belong to.

    The rule is otherwise unchanged: **they are on screen when they can share a
    line with the client, and nowhere else.** From `xl` they take a column of
    their own beside the name and cost the board nothing — spread
    `justify-between` across the whole of it, with every value truncating rather
    than growing, so a client with a long allergy list shortens their own fact
    instead of pushing the others off the line. The tip carries the full text.

    Below that they would need a row, and a row is 42px of a board that is
    pinned to the frame and cannot grow. On a tablet they are gone: the notes
    panel is one press away, holds all of them, and is where the rest of the
    profile already lives.

    A phone is the exception, and only because the page scrolls there — the row
    costs nothing anyone can see.
  */
  const summary = (
    <section
      aria-label={t('planningSnapshot')}
      className="col-span-full flex min-w-0 flex-wrap items-center gap-x-4 overflow-hidden rounded-md bg-muted/70 px-3 py-1 md:hidden xl:px-2 xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:flex xl:flex-nowrap xl:justify-between xl:gap-x-2"
    >
      <SummaryFact label={t('dailyTarget')} numeric>
        {context.effectiveKcal === null
          ? t('unset')
          : t('kcalValue', { value: context.effectiveKcal })}
      </SummaryFact>
      <SummaryFact label={t('fields.proteinTargetGrams')} numeric>
        {context.effectiveProteinGrams === null
          ? t('unset')
          : t('grams', { value: context.effectiveProteinGrams })}
      </SummaryFact>
      {/*
        **The short form on the line, the sentence in the tip.**

        This one carried the full warning — "لم تُسجّل معلومات الحساسية. تأكد
        منها قبل نشر الخطة." — as its value, which is a sentence where a number
        goes. Two words go on the line; the sentence is one hover away and is
        also in the notes popover, where the rest of the profile lives.
      */}
      <SummaryFact
        label={t('allergies')}
        hint={allergyText || t('allergiesMissing')}
        className={allergyText ? 'text-status-medical-fg' : 'text-status-attention-fg'}
      >
        {allergyText || t('allergiesMissingShort')}
      </SummaryFact>
    </section>
  );

  if (embedded) {
    return (
      <>
        {identity}
        {summary}
      </>
    );
  }

  /* Standing on its own — no board header around it — it needs the card back. */
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-card">
      {identity}
      {summary}
    </div>
  );
}

function SummaryFact({
  label,
  numeric,
  hint,
  className,
  children,
}: {
  label: string;
  numeric?: boolean;
  /**
   * The long version, for a fact whose value is a shortened stand-in.
   *
   * Only the one that actually has more to say gets one. A tip on "27.7" would
   * repeat what is already fully readable an inch below the pointer, and five
   * facts that each raise a panel turn reading the header into a game of
   * avoiding them.
   */
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const value = (
    <p
      className={cn(
        // 14px at 500, where this was 16px at 600.
        //
        // A fact is a caption with a number beside it, and at semibold-16 five
        // of them across the top of the board were the loudest thing on the
        // screen — heavier than the client's own name and heavier than any dish
        // below. The label carries the hierarchy instead, at 12px and muted; the
        // value only has to be the darker, larger of the two, which 14px at 500
        // already is.
        //
        // `truncate` on every one of them, without exception: five facts share
        // one line, and one value allowed to grow is four values pushed off the
        // end of it.
        'truncate text-body-sm font-medium',
        numeric && 'tabular-nums',
      )}
      dir={numeric ? 'ltr' : 'auto'}
    >
      {children}
    </p>
  );

  return (
    <div
      className={cn(
        // The gutter between a label and its own value closes to 4px on the
        // one line where all five compete for the same 40rem — 10px across the
        // row, which is most of what stands between "إنقاص الوزن" and an
        // ellipsis at 1280px.
        'flex min-w-0 items-baseline gap-1.5 text-start xl:gap-1',
        /*
          **The figures do not give up width; the phrases do.**

          Five facts on one line need about 41rem in Arabic and the column they
          share with the client and the action bar is nearer 39rem on a 1280px
          laptop, so something has to shrink. Left to itself flexbox took the
          same slice off all five, which meant a daily target reading "2178 k…"
          — and half of a number is not a smaller number, it is a wrong one.
          These three are short and fixed and keep their width; the two that
          hold words absorb the whole squeeze, and both carry the full text in a
          tip.
        */
        numeric && 'shrink-0',
        className,
      )}
    >
      {/* The label never truncates. It is two or three words naming what the
          number is, and half of "مؤشر كتلة الج…" names nothing — if something
          has to give up width here it is the value, which has a tip and a panel
          behind it. */}
      <p className="shrink-0 text-caption leading-tight text-muted-foreground">{label}</p>
      {hint ? (
        <TooltipHint label={hint} className="min-w-0">
          {value}
        </TooltipHint>
      ) : (
        value
      )}
    </div>
  );
}

/**
 * One derived fact, as a row rather than a cell.
 *
 * Label at the inline-start, value at the inline-end, both on one baseline —
 * the shape a spec sheet uses, and the reason it is right here is that the two
 * values are wildly different lengths. "متوسط" is five characters and
 * "80 كغ · 170 سم · 28 سنة" is twenty-three; in a two-column grid the second
 * one wraps while the first leaves half its cell empty. Given the row, the long
 * one has the width it needs and the short one costs nothing.
 */
/** The heading over one group of facts. */
function SpecHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="pb-1.5 text-caption font-semibold text-muted-foreground">{children}</h4>;
}

/**
 * One of the two numbers the week is built against, at a size that says so.
 *
 * `tabular-nums` and `dir="ltr"` on the value: it is a figure with a unit
 * attached, and "2178 kcal" reads left to right in Arabic exactly as it does in
 * English — the label above it is what carries the direction of the panel.
 */
function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/70 px-3 py-2">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-body-lg font-medium tabular-nums" dir="auto">
        {children}
      </p>
    </div>
  );
}

function SpecRow({
  label,
  tone,
  children,
}: {
  label: string;
  /** Colours the value where the value is a warning — allergies, and only that. */
  tone?: 'medical' | 'attention';
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-body-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-end',
          tone === 'medical' && 'text-status-medical-fg',
          tone === 'attention' && 'text-status-attention-fg',
        )}
        dir="auto"
      >
        {children}
      </dd>
    </div>
  );
}
