import * as React from 'react';
import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
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

            Four passes on this surface, and the last one is about direction.

            What is here is seven facts, three of which are *numerals with a
            unit attached* — "2207 kcal", "26.7", "80 كغ · 173 سم · 28 سنة". A
            figure runs left-to-right in every language, and the first attempt at
            saying so was `dir="ltr"` on the element holding it. That is the
            trap: `dir` sets the alignment as well as the run order, so in an
            Arabic panel the label sat against the right edge and the value it
            labels sat against the left — the two halves of one fact at opposite
            ends of the same box, on every numeric row here.

            `<bdi dir="ltr">` is the fix, and the reason every figure below wears
            one without exception. It isolates the numeral's *internal* direction
            — so "2207 kcal" can never come out as "kcal 2207" — and leaves the
            alignment to the block, which follows the panel. The label and its
            value land on the same edge in Arabic and in English, from the same
            markup.

            The rest of the pass is subtraction. The allergy fact was a filled
            two-line banner and is one row with a mark on it; the "missing
            fields" warning was a second filled banner above it and is now a
            quiet line under the targets it is actually about, because it is a
            note about the profile rather than something that has gone wrong.
            Two filled colour blocks stacked at the top of a panel is a panel
            that opens by shouting — and the one fact here that can genuinely
            stop a plan going out was the quieter of the two.
          */}
          <PopoverContent
            align="end"
            side="bottom"
            className="max-h-[min(38rem,80dvh)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto p-0 shadow-lg"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-popover/95 px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-full bg-primary-subtle text-primary">
                  <Icon name="info" className="size-3.5" />
                </div>
                <PopoverTitle className="font-heading text-body-md font-semibold text-foreground">
                  {t('planningNotes')}
                </PopoverTitle>
              </div>
              <PopoverClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t('close')}
                  >
                    <Icon name="close" className="size-3.5" />
                  </Button>
                }
              />
            </div>

            <div className="flex flex-col gap-5 p-4 pb-6">
              {/* Allergy banner */}
              <div
                className={cn(
                  'flex items-start gap-2.5 rounded-lg border p-3 text-body-sm',
                  allergyText
                    ? 'border-status-medical-fg/25 bg-status-medical-bg text-status-medical-fg'
                    : 'border-status-attention-fg/25 bg-status-attention-bg text-status-attention-fg',
                )}
              >
                <Icon
                  name={allergyText ? 'medical' : 'attention'}
                  className="mt-0.5 size-4 shrink-0"
                />
                <div className="min-w-0 flex-1 leading-relaxed" dir="auto">
                  <span className="font-semibold">{t('allergies')}</span>
                  <span className="mx-1.5 opacity-60">·</span>
                  <span className="font-medium [overflow-wrap:anywhere]">
                    {allergyText || t('allergiesMissing')}
                  </span>
                </div>
              </div>

              {/* Targets */}
              <section>
                <SpecHeading>{t('notesTargets')}</SpecHeading>
                <div className="grid grid-cols-2 gap-2.5">
                  <Figure label={t('dailyTarget')}>
                    {context.effectiveKcal === null ? (
                      <span className="text-body-sm font-normal text-muted-foreground">{t('unset')}</span>
                    ) : (
                      <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                        <bdi className="tabular-nums font-bold">{context.effectiveKcal}</bdi>
                        <span className="text-caption font-normal text-muted-foreground">kcal</span>
                      </span>
                    )}
                  </Figure>
                  <Figure label={t('fields.proteinTargetGrams')}>
                    {context.effectiveProteinGrams === null ? (
                      <span className="text-body-sm font-normal text-muted-foreground">{t('unset')}</span>
                    ) : (
                      <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                        <bdi className="tabular-nums font-bold">{context.effectiveProteinGrams}</bdi>
                        <span className="text-caption font-normal text-muted-foreground">
                          {locale === 'ar' ? 'غرام' : 'g'}
                        </span>
                      </span>
                    )}
                  </Figure>
                </div>

                {targets.missing.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md bg-status-attention-bg/60 px-2.5 py-1.5 text-caption leading-relaxed text-status-attention-fg" dir="auto">
                    <Icon name="attention" className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {t('missingFields', {
                        fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
                      })}
                    </span>
                  </div>
                )}
              </section>

              {/* Body stats */}
              <section>
                <SpecHeading>{t('notesBody')}</SpecHeading>
                <dl className="divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/40 px-3.5">
                  <SpecRow label={t('goal')}>
                    {isMember(CLIENT_GOALS, context.goal) ? (
                      tGoals(context.goal)
                    ) : (
                      <span className="text-muted-foreground font-normal">{t('unset')}</span>
                    )}
                  </SpecRow>
                  <SpecRow label={t('bmi')}>
                    {targets.bmi === null ? (
                      <span className="text-muted-foreground font-normal">{t('unset')}</span>
                    ) : (
                      <bdi className="tabular-nums font-semibold">{targets.bmi.toFixed(1)}</bdi>
                    )}
                  </SpecRow>
                  <SpecRow label={t('activityLevel')}>
                    {isMember(CLIENT_ACTIVITY_LEVELS, context.activityLevel) ? (
                      tActivity(context.activityLevel)
                    ) : (
                      <span className="text-muted-foreground font-normal">{t('unset')}</span>
                    )}
                  </SpecRow>
                  <SpecRow label={t('measurements')}>
                    {measurements.length > 0 ? (
                      <span className="inline-flex flex-wrap items-center justify-end gap-1.5 text-end" dir="auto">
                        {measurements.map((entry, index) => (
                          <React.Fragment key={index}>
                            {index > 0 && <span className="text-muted-foreground/40 select-none">·</span>}
                            <span className="whitespace-nowrap font-medium">{entry}</span>
                          </React.Fragment>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-normal">{t('unset')}</span>
                    )}
                  </SpecRow>
                </dl>
              </section>

              {/* Written notes & unwritten indicators */}
              <section>
                <SpecHeading>{t('notesWritten')}</SpecHeading>

                {written.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3.5 py-3 text-center text-body-sm text-muted-foreground">
                    {t('notesNothingWritten')}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {written.map((note) => (
                      <div key={note.key} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                        <p className="text-caption font-semibold text-muted-foreground">
                          {note.label}
                        </p>
                        <p
                          className="mt-1 text-body-sm leading-relaxed text-foreground [overflow-wrap:anywhere]"
                          dir="auto"
                        >
                          {note.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {blank.length > 0 && (
                  <div className="mt-3 rounded-lg border border-border/50 bg-muted/40 p-2.5 text-caption leading-relaxed text-muted-foreground" dir="auto">
                    <span className="font-medium text-foreground/70">
                      {locale === 'ar' ? 'لم تُسجّل: ' : 'Unwritten: '}
                    </span>
                    <span className="[overflow-wrap:anywhere]">
                      {blank.map((note) => note.label).join('، ')}
                    </span>
                  </div>
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
    /*
      ── Three facts distributed across the header's middle column ──

      On desktop (`xl`), this section takes the full width of the middle column
      (`xl:w-full`) to bridge the space between the client profile and the action bar.
      The three facts (daily target, protein target, allergies) are distributed
      evenly with dividers and comfortable spacing between label and value.

      Below `md`, it wraps on a line of its own for narrow viewports. On tablet
      (`md`), it is hidden because the two-column header cannot fit all three.
    */
    <section
      aria-label={t('planningSnapshot')}
      className="col-span-full flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 overflow-hidden rounded-lg bg-muted/70 px-3 py-1.5 md:hidden xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:flex xl:h-12 xl:w-full xl:items-center xl:justify-between xl:gap-0 xl:self-center xl:px-4 xl:py-0"
    >
      <SummaryFact label={t('dailyTarget')} numeric>
        {context.effectiveKcal === null
          ? t('unset')
          : t('kcalValue', { value: context.effectiveKcal })}
      </SummaryFact>
      <SummaryDivider />
      <SummaryFact label={t('fields.proteinTargetGrams')} numeric>
        {context.effectiveProteinGrams === null
          ? t('unset')
          : t('grams', { value: context.effectiveProteinGrams })}
      </SummaryFact>
      <SummaryDivider />
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

/**
 * What separates two facts on the header's line.
 *
 * The gutter used to do this on its own — `justify-between` put a field of
 * empty space between them — and closing that gutter to 10px meant the three
 * ran together into one strip of text. A 1px rule at 60% height does the
 * dividing in 1px that distance was doing in 200, which is the whole point of
 * the change: the facts sit close enough to be read as a group and still read
 * as three.
 *
 * `aria-hidden`, and outside every `SummaryFact`: it is punctuation between
 * items, and a screen reader running the line should hear three facts rather
 * than three facts and two decorations.
 */
function SummaryDivider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-border max-xl:hidden" />;
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
    >
      {/* `<bdi dir="ltr">` on a figure, `dir="auto"` on a phrase — the same
          split the notes popover makes, and for the same reason: `dir` on this
          paragraph would set its alignment as well as its run order, and the
          allergy fact is the one value here allowed to shrink. See `Figure`. */}
      {numeric ? <bdi dir="ltr">{children}</bdi> : <span dir="auto">{children}</span>}
    </p>
  );

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 text-start xl:flex-1 xl:justify-center xl:gap-2.5 xl:px-3',
        numeric && 'shrink-0 xl:shrink',
        className,
      )}
    >
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
  return (
    <h4 className="flex items-center gap-1.5 pb-2 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h4>
  );
}

/**
 * One of the two target numbers, styled as a defined stat tile with no BiDi wrapping issues.
 */
function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-border/60 bg-muted/40 p-3">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-body-md font-semibold text-foreground" dir="auto">
        {children}
      </p>
    </div>
  );
}

function SpecRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-body-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground text-end" dir="auto">
        {children}
      </dd>
    </div>
  );
}
