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
 * The client facts needed while planning, now part of the board header instead
 * of a permanent side tab. The short strip answers the common questions; the
 * popover keeps the longer clinical notes one action away without narrowing the
 * seven-day workspace.
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

  const measurements = [
    profile?.weightKg !== null && profile?.weightKg !== undefined
      ? t('kg', { value: profile.weightKg })
      : null,
    context.heightCm !== null ? t('cm', { value: context.heightCm }) : null,
    context.age !== null ? t('years', { value: context.age }) : null,
  ].filter((entry): entry is string => entry !== null);
  const selectedClient = clients.find((client) => client.id === context.clientId);

  return (
    <section
      aria-label={t('planningSnapshot')}
      className={cn(
        'bg-card px-3 py-2',
        !embedded && 'rounded-lg border border-border shadow-card',
      )}
    >
      {/*
        Two rows at every width, and three columns where the numbers have room
        to sit beside the client rather than under them.

        This used to stack three separate blocks — the picker, then a grid of
        facts, then the two profile buttons — until `lg`, which is 230px of
        header before the first meal card on a screen 768px tall in landscape.
        There is no width where a 44px avatar and two 40px buttons cannot share
        a line, so they always do, and the facts take the row under them.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 xl:grid-cols-[minmax(15rem,1fr)_minmax(30rem,2fr)_auto]">
        {/* `gap-2`, not `gap-3`. The disc and the name are one thing — a person
            — and the same gutter that separates them from the profile button
            made them read as two items in a toolbar. */}
        {/* Two things, always: the disc and the name. Nothing else joins this
            row — the profile control lives in the action column with the other
            profile control, so the header keeps one layout whatever state the
            client is in. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:flex-nowrap">
          {/*
            The client's calendar colour — the disc heading the week being
            planned is the one their appointments are drawn in. See
            `patient-color.ts`; `contents` keeps this scope out of the row's
            own layout.
          */}
          {selectedClient ? (
            <span className="patient-tone contents" style={patientToneStyle(selectedClient.seq)}>
              {/* `lg` (44px), not `planner` (56px). That size exists to match
                  the fact tiles beside it, and those tiles are 44px now — a
                  56px disc would be the one thing in the row still setting the
                  old height, which is the height this pass is removing. */}
              <Avatar name={selectedClient.fullName} color="var(--tone-mark)" size="lg" />
            </span>
          ) : null}

          <div className="min-w-44 flex-1">
            <ClientPicker
              clients={clients}
              selectedClientId={context.clientId}
              appearance="bar"
            />
          </div>

        </div>

        {/*
          ── A strip, and only a grid of tiles where there is width to spend ──

          What these five hold is five short answers: a target, a target, a
          ratio, a word, and a word. As 44px tiles they were a second band
          across the top of the board — three rows of them on a phone, two on a
          tablet — and the board pays for every one of those in meal cards.

          So the default is a line of label-and-value pairs inside one muted
          bar, wrapping as many times as it must: 24px a line instead of 44 a
          row, with nothing dropped and nothing hidden behind a control. The
          tiles come back at `xl`, where they sit in their own column beside the
          client rather than under them and cost the board nothing.

          Wrapping rather than scrolling is deliberate. The width where five
          pairs do not fit on one line is 768px in English, and a second 24px
          line is the graceful answer to it — graceful in the right direction,
          too, since that width is portrait, where the height exists, and
          landscape fits on one. A scroll would have put the allergy fact behind
          a gesture with nothing on screen to suggest it.
        */}
        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-4 rounded-md bg-muted/70 px-2.5 py-1 xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:grid xl:grid-cols-5 xl:gap-1.5 xl:rounded-none xl:bg-transparent xl:p-0">
          <SummaryFact label={t('dailyTarget')} numeric>
            {context.effectiveKcal === null ? t('unset') : t('kcalValue', { value: context.effectiveKcal })}
          </SummaryFact>
          <SummaryFact label={t('fields.proteinTargetGrams')} numeric>
            {context.effectiveProteinGrams === null
              ? t('unset')
              : t('grams', { value: context.effectiveProteinGrams })}
          </SummaryFact>
          <SummaryFact label={t('bmi')} numeric>
            {targets.bmi === null ? t('unset') : targets.bmi.toFixed(1)}
          </SummaryFact>
          <SummaryFact label={t('goal')}>
            {isMember(CLIENT_GOALS, context.goal) ? tGoals(context.goal) : t('unset')}
          </SummaryFact>
          {/*
            **The short form in the tile, the sentence in the tip.**

            This one carried the full warning — "لم تُسجّل معلومات الحساسية. تأكد
            منها قبل نشر الخطة." — as its value, which is a sentence in a box
            sized for a number. It wrapped to four lines, and because these five
            are grid siblings that made *all five* 81px, so a client with no
            allergies recorded got a header half again as tall as one who had.
            Two words go in the tile; the sentence is one hover away and is also
            in the notes popover, where the rest of the profile lives.
          */}
          <SummaryFact
            label={t('allergies')}
            hint={allergyText || t('allergiesMissing')}
            className={allergyText ? 'text-status-medical-fg' : 'text-status-attention-fg'}
          >
            {allergyText || t('allergiesMissingShort')}
          </SummaryFact>
        </div>

        {/* Side by side at every width. This pair used to stack into a column
            at `xl`, which made the header as tall as two icon buttons plus
            their gap — taller than the row of facts it sits beside, so it, not
            the content, was setting the panel's height. */}
        <div className="col-start-2 row-start-1 flex items-center gap-1 rounded-lg bg-muted/70 p-1 xl:col-start-3">
          <Popover>
          <TooltipHint label={t('planningNotes')}>
            <PopoverTrigger
              aria-label={t('planningNotes')}
              className={buttonVariants({
                variant: 'neutral',
                size: 'icon-sm',
              })}
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
              <PopoverTitle className="font-heading text-body-md font-semibold">
                {t('planningNotes')}
              </PopoverTitle>
              <p className="mt-0.5 truncate text-caption text-muted-foreground" dir="auto">
                {context.fullName}
              </p>
            </div>

            <div className="space-y-4 p-4">
              {targets.missing.length > 0 && (
                <p className="rounded-md bg-status-attention-bg px-3 py-2 text-body-sm leading-relaxed text-status-attention-fg">
                  {t('missingFields', {
                    fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
                  })}
                </p>
              )}

              {/* The sunken fill the header's fact tiles use, so the popover
                  reads as the same object opened up rather than as a second
                  design of the same information. */}
              <dl className="divide-y divide-border rounded-lg bg-muted/70 px-3">
                <SpecRow label={t('activityLevel')}>
                  {isMember(CLIENT_ACTIVITY_LEVELS, context.activityLevel)
                    ? tActivity(context.activityLevel)
                    : t('unset')}
                </SpecRow>
                <SpecRow label={t('measurements')}>
                  {measurements.length ? measurements.join(' · ') : t('unset')}
                </SpecRow>
              </dl>

              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.key}>
                    <p className="text-caption font-medium text-muted-foreground">{note.label}</p>
                    <p
                      className={cn(
                        'mt-1 text-body-sm leading-relaxed [overflow-wrap:anywhere]',
                        !note.body && 'text-muted-foreground',
                      )}
                      dir="auto"
                    >
                      {note.body || t('unset')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
          </Popover>

          {/*
            One control in two states, in one place — the same rule the publish
            button follows.

            Creating the first profile and editing an existing one open the same
            form and mean the same thing to the layout, so they are the same
            button: a plus until there is a profile, a pencil after. It used to
            be two different controls in two different places — a labelled
            "create profile" button wedged in beside the client's name, and a
            pencil down here — so filling in a profile moved a control across
            the header and changed its shape on the way. The header now has one
            layout, whatever state the client is in.
          */}
          <TooltipHint label={profile ? t('editProfile') : t('createProfile')}>
            <IntakeFormTrigger
              locale={locale}
              clientId={context.clientId}
              aria-label={profile ? t('editProfile') : t('createProfile')}
              className={buttonVariants({ variant: 'neutral', size: 'icon-sm' })}
            >
              <Icon name={profile ? 'edit' : 'add'} />
              <span className="sr-only">{profile ? t('editProfile') : t('createProfile')}</span>
            </IntakeFormTrigger>
          </TooltipHint>
        </div>
      </div>
    </section>
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
   * The long version, for a tile whose value is a shortened stand-in.
   *
   * Only the fact that actually has more to say gets one. A tip on "27.7"
   * would repeat what is already fully readable an inch below the pointer, and
   * five tiles that each raise a panel turn reading the header into a game of
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
        // A fact tile is a caption with a number under it, and at semibold-16
        // five of them across the top of the board were the loudest thing on
        // the screen — heavier than the client's own name beside them and
        // heavier than any dish on the board below. The label carries the
        // hierarchy instead, at 12px and muted; the value only has to be the
        // darker, larger of the two, which 14px at 500 already is. The 12px
        // this gives back per tile is 12px of meal card.
        //
        // `truncate` on every one of them, without exception: these five are
        // grid siblings, so one value allowed to wrap sets the height of the
        // other four.
        // `max-w-40` in the strip: these are flex items there rather than grid
        // siblings, so a long value cannot set anyone else's height — but it
        // can still push the other four onto a line of their own. The cap is
        // the same answer the tile shape reaches by truncating.
        'max-w-40 truncate text-body-sm font-medium xl:w-full xl:max-w-none',
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
        // The strip: label and value on one baseline, the muted fill handed up
        // to the bar that holds all five. The tile — a stacked box with its own
        // fill and a 44px floor — is the `xl` shape. See the container above.
        'flex min-w-0 shrink-0 items-baseline gap-1.5 text-start',
        'xl:min-h-11 xl:shrink xl:flex-col xl:items-center xl:justify-center xl:gap-0 xl:rounded-md xl:bg-muted/70 xl:px-2 xl:py-1 xl:text-center',
        className,
      )}
    >
      <p className="text-caption leading-tight text-muted-foreground">{label}</p>
      {hint ? (
        <TooltipHint label={hint} className="w-full min-w-0 justify-center">
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
function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-body-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end" dir="auto">
        {children}
      </dd>
    </div>
  );
}
