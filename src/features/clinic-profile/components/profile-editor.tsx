'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import { Tabs, tabLinkVariants } from '@/components/ui/tabs';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

import { saveClinicInformationAction, saveProfessionalProfileAction, saveWeeklyScheduleAction } from '../actions';
import { initialClinicProfileFormState, type ClinicProfileFormState } from '../form-state';
import type { ClinicProfileSnapshot } from '../types';
import type { ClinicProfileFieldErrors, ProfileSection } from '../validation';
import { ClinicInformationFields, ProfessionalFields, ScheduleFields } from './profile-fields';

/**
 * The clinic profile, in three sections.
 *
 * ## The sections are addresses now
 *
 * They were three `Button`s flipping a `useState`, which meant the section you
 * were on could not be linked to, did not survive a reload, and was gone the
 * moment anything re-rendered the page. They are `?section=` links through the
 * shared `Tabs` — the same control and the same reasoning as the client
 * record's five tabs, which is the screen this most resembles.
 *
 * ## Leaving a section no longer eats what you typed
 *
 * Each section is its own form with its own save, which is deliberate: three
 * short forms saved separately beat one long form that refuses to save any of
 * itself because of a typo in a different section. The cost was that switching
 * section silently discarded whatever was in the fields, and a tab looks like
 * something you can flick between. The guard below makes leaving with unsaved
 * edits ask first — the system's own `ConfirmDialog`, not `window.confirm`.
 */

const SECTIONS = ['clinic', 'schedule', 'professional'] as const;

const SECTION_ICONS = {
  clinic: 'contact',
  schedule: 'clock',
  professional: 'profile',
} as const satisfies Record<ProfileSection, IconName>;

const SECTION_ACTIONS = {
  clinic: saveClinicInformationAction,
  schedule: saveWeeklyScheduleAction,
  professional: saveProfessionalProfileAction,
} as const;

export function ProfileEditor({
  locale,
  profile,
  section,
}: {
  locale: Locale;
  profile: ClinicProfileSnapshot;
  /** Resolved from `?section=` on the server, so the first paint is correct. */
  section: ProfileSection;
}) {
  const t = useTranslations('clinicProfile');
  const router = useRouter();

  /**
   * Whether the section on screen has edits that have not been saved.
   *
   * Tracked with a boolean off the form's `onInput` rather than by diffing
   * values against the snapshot: the question the guard asks is "did you touch
   * this", and someone who typed a character and deleted it still deserves the
   * prompt more than they deserve a silent discard.
   */
  const [dirty, setDirty] = useState(false);
  const [leavingTo, setLeavingTo] = useState<ProfileSection | null>(null);

  function go(next: ProfileSection): void {
    setDirty(false);
    router.push(`/app/profile?section=${next}`);
  }

  return (
    /*
      `me-auto`, not `mx-auto`. A centred 3xl column inside a full-width `main`
      left a 400px band of nothing between the page and the rail, and put this
      screen's `h1` 400px in from an edge every other staff page starts its
      heading at — the dashboard and the register both run the full width, so
      centring made these pages look detached from the navigation rather than
      generously spaced. The measure is still capped; the slack now all falls on
      the far side, where the page simply ends.
    */
    <div className="me-auto w-full max-w-3xl space-y-4 text-start">
      {/*
        No eyebrow. It read "Clinic setup" in uppercase letter-spaced 12px over
        a heading that already said "Clinic profile" — a second, quieter title
        saying the same thing, and one whose tracking `globals.css` strips in
        Arabic, so the two locales did not even match.
      */}
      <div className="space-y-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">
          {t('profileTitle')}
        </h1>
        <p className="text-body-sm text-muted-foreground">{t('profileDescription')}</p>
      </div>

      <Tabs label={t('profileSections')}>
        {SECTIONS.map((item) => {
          const active = item === section;

          return (
            <Link
              key={item}
              href={`/app/profile?section=${item}`}
              aria-current={active ? 'page' : undefined}
              className={tabLinkVariants({ active })}
              onClick={(event) => {
                if (!dirty || active) return;
                // A real link, intercepted only while there is something to
                // lose — so Cmd-click, middle-click and "open in new tab" all
                // keep working on a clean form.
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                setLeavingTo(item);
              }}
            >
              <Icon name={SECTION_ICONS[item]} className="size-[17px]" />
              {t(`sections.${item}`)}
            </Link>
          );
        })}
      </Tabs>

      <SectionForm
        // Remounts on section change, so one section's pending state and
        // messages never bleed into the next.
        key={section}
        locale={locale}
        title={t(`sections.${section}`)}
        description={t(`sectionDescriptions.${section}`)}
        action={SECTION_ACTIONS[section]}
        onDirtyChange={setDirty}
      >
        {(errors) =>
          section === 'clinic' ? (
            <ClinicInformationFields profile={profile} fieldErrors={errors} />
          ) : section === 'schedule' ? (
            /*
             * The only section that has to report its own edits: a switch and
             * two hidden inputs fire no `input` event, so the form's own
             * listener never hears a week of hours change.
             */
            <ScheduleFields profile={profile} fieldErrors={errors} onEdit={() => setDirty(true)} />
          ) : (
            <ProfessionalFields profile={profile} fieldErrors={errors} />
          )
        }
      </SectionForm>

      {leavingTo ? (
        <ConfirmDialog
          locale={locale}
          title={t('leaveTitle')}
          description={t('leaveDescription')}
          confirmLabel={t('leaveConfirm')}
          cancelLabel={t('leaveCancel')}
          onConfirm={() => {
            const next = leavingTo;
            setLeavingTo(null);
            go(next);
          }}
          onCancel={() => setLeavingTo(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * One section's card and its save.
 *
 * The result message is a `Callout`, which is the shape this system gives a
 * statement the reader has to notice. It was a bare paragraph coloured
 * `text-emerald-700` on success and `text-amber-700` on a schedule conflict —
 * two Tailwind stock hues, neither of them in the palette, and emerald in
 * particular in a system that deliberately has no green-means-go colour.
 *
 * Success has no tone of its own here for the same reason `Callout` has no
 * `success` variant: it lands as the neutral note, which is all "saved" needs
 * to be. A schedule conflict is `attention`, because someone has to go and look
 * at the appointments it just left outside opening hours — and so is a failed
 * save, for the same reason. Not `medical`: clay is this system's only alarm
 * and it is reserved for a real allergy, condition or contraindication, which
 * "we could not save your changes" is not.
 */
function SectionForm({
  locale,
  title,
  description,
  action,
  onDirtyChange,
  children,
}: {
  locale: Locale;
  title: string;
  description: string;
  action: (state: ClinicProfileFormState, data: FormData) => Promise<ClinicProfileFormState>;
  onDirtyChange: (dirty: boolean) => void;
  children: (fieldErrors?: ClinicProfileFieldErrors) => React.ReactNode;
}) {
  const t = useTranslations('clinicProfile');
  const [state, formAction, pending] = useActionState(action, initialClinicProfileFormState);

  const fieldErrors =
    state.status === 'error' && state.messageKey === 'invalid' ? state.fieldErrors : undefined;

  return (
    <form
      action={(data) => {
        onDirtyChange(false);
        formAction(data);
      }}
      noValidate
      onInput={() => onDirtyChange(true)}
    >
      <input type="hidden" name="locale" value={locale} />

      <Card>
        <CardHeader>
          <CardTitle as="h2">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {children(fieldErrors)}

          {state.status !== 'idle' ? (
            <Callout
              role="status"
              tone={state.status === 'success' ? 'neutral' : 'attention'}
              icon={state.status === 'success' ? 'check' : undefined}
            >
              {state.status === 'warning'
                ? t('messages.scheduleConflict', { count: state.conflictCount })
                : t(`messages.${state.messageKey}`)}
            </Callout>
          ) : null}
        </CardContent>

        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? t('saving') : t('saveChanges')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
