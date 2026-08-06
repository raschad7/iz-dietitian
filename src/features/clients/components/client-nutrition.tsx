import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { calculateAge } from '@/features/clients/age';
import { IntakeFormTrigger } from '@/features/clients/components/intake-form-trigger';
import { ALLERGENS } from '@/features/clients/nutrition';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import { type ClientIntakeValues } from '@/features/clients/types';
import { suggestProteinGrams, suggestTargets } from '@/features/weekly-plans/targets';
import { type Locale } from '@/i18n/routing';
import { isMember, membersOf } from '@/lib/enum';
import { cn } from '@/lib/utils';

/**
 * A client's nutrition record, read-only, with the dialog that writes it.
 *
 * The same relationship the Info tab has with the client card: the tab is what
 * you read, the dialog is what you write, and neither is a page you navigate
 * away to.
 *
 * **What is known is shown; what is missing is counted once.** The first version
 * of this screen rendered every field whether or not it held anything, so a
 * client with two facts on file produced nine columns, seven of them reading
 * "not provided" — a page four-fifths made of negative statements, which is
 * both harder to scan and a worse answer than one line saying how many gaps are
 * left and offering to fill them.
 *
 * A server component. `IntakeFormTrigger` is the only client component here and
 * reads the record itself when opened, so none of this ships to the browser
 * twice.
 */
export function ClientNutrition({
  intake,
  locale,
}: {
  intake: ClientIntakeValues;
  locale: Locale;
}) {
  const t = useTranslations('clients');

  const age = intake.dateOfBirth ? calculateAge(intake.dateOfBirth) : null;

  const targets = suggestTargets({
    weightKg: intake.weightKg,
    heightCm: intake.heightCm,
    age,
    sex: intake.sex,
    activityLevel: intake.activityLevel,
    goal: intake.goal,
  });

  const effectiveKcal = intake.dailyKcalTarget ?? targets.suggestedKcal;
  const effectiveProtein = intake.proteinTargetGrams ?? suggestProteinGrams(intake.weightKg);
  const allergenTags = membersOf(ALLERGENS, intake.allergenTags);

  const goalLabel = isMember(CLIENT_GOALS, intake.goal) ? t(`goal.${intake.goal}`) : null;
  const activityLabel = isMember(CLIENT_ACTIVITY_LEVELS, intake.activityLevel)
    ? t(`activity.${intake.activityLevel}`)
    : null;

  /*
   * Every field this tab can show, so the gaps can be counted rather than
   * drawn. Listed here and not derived from the type: `hasProfile` and the
   * demographics are not fields a dietitian fills in on this screen, and
   * counting them would report gaps nobody can close from here.
   */
  const values = [
    intake.heightCm,
    intake.weightKg,
    goalLabel,
    activityLabel,
    intake.allergies,
    intake.conditions,
    intake.medications,
    intake.permanentInstructions,
    intake.preferences,
    intake.dislikes,
    intake.medicalNotes,
    intake.notes,
    intake.careNote,
  ];

  const unset = values.filter((value) => value === null || value === '').length;

  const edit = (
    <IntakeFormTrigger
      locale={locale}
      clientId={intake.clientId}
      className={buttonVariants({
        variant: targets.missing.length > 0 ? 'default' : 'outline',
        size: 'sm',
      })}
    >
      <Icon name="edit" />
      {intake.hasProfile ? t('intake.edit') : t('intake.start')}
    </IntakeFormTrigger>
  );

  return (
    <div className="space-y-4">
      {/*
        One status bar, carrying the edit control. It reports the blocking case
        (a target cannot be computed) when there is one, and otherwise how much
        of the record is still empty — so the two states share a shape and the
        button never moves between them.
      */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3',
          targets.missing.length > 0 ? 'bg-status-attention-bg' : 'border border-border',
        )}
      >
        {targets.missing.length > 0 ? (
          <p className="text-body-sm leading-relaxed text-status-attention-fg">
            {t('intake.missingFields', {
              fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
            })}
          </p>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            {unset === 0
              ? t('intake.complete')
              : unset === 1
                ? t('intake.unsetOne')
                : t('intake.unsetCount', { count: unset })}
          </p>
        )}
        {edit}
      </div>

      {/*
        `items-start` and not a stretched grid: these cards hold different
        amounts, and forcing equal heights would pad the shorter one with the
        dead space the first version of this screen was full of.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle icon="progress" className="text-base">
              {t('intake.sections.measurements')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Facts>
              <Fact
                label={t('fields.heightCm')}
                value={intake.heightCm}
                unit={t('units.cm')}
              />
              <Fact label={t('fields.weightKg')} value={intake.weightKg} unit={t('units.kg')} />
              <Fact
                label={t('fields.age')}
                value={age === null ? null : t('yearsOld', { count: age })}
              />
              <Fact label={t('fields.goal')} value={goalLabel} />
              <Fact label={t('fields.activityLevel')} value={activityLabel} />
              <Fact
                label={t('intake.bmi')}
                value={targets.bmi === null ? null : targets.bmi.toFixed(1)}
                // The category is a note under the figure rather than appended
                // to it: "27.4 · زيادة وزن" sat one line under a goal reading
                // "زيادة الوزن", and two different facts in near-identical
                // words on one card is a card nobody trusts.
                note={
                  targets.bmiCategory
                    ? t('intake.bmiLabel', { category: t(`bmiCategories.${targets.bmiCategory}`) })
                    : undefined
                }
              />
            </Facts>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle icon="trend" className="text-base">
              {t('intake.sections.targets')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Facts columns={1}>
              <Fact
                label={t('intake.dailyTarget')}
                value={effectiveKcal}
                unit={t('units.kcal')}
                note={
                  effectiveKcal === null
                    ? undefined
                    : intake.dailyKcalTarget === null
                      ? t('intake.fromFormula')
                      : t('intake.override')
                }
              />
              <Fact
                label={t('fields.proteinTargetGrams')}
                value={effectiveProtein}
                unit={t('units.g')}
                note={
                  effectiveProtein === null || intake.proteinTargetGrams !== null
                    ? undefined
                    : t('intake.suggested')
                }
              />
            </Facts>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle icon="medical" className="text-base">
              {t('intake.sections.allergies')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {allergenTags.length > 0 || intake.customAllergens.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {allergenTags.map((tag) => (
                  <Badge key={tag} variant="medical">
                    {t(`allergens.${tag}`)}
                  </Badge>
                ))}

                {/*
                  Outlined, not filled — the same distinction the intake dialog
                  draws. A solid clay badge means "the catalog excludes this";
                  these are recorded and sent to the model and exclude nothing,
                  and a reader glancing at this card has to be able to tell the
                  two apart without reading a legend.
                */}
                {intake.customAllergens.map((tag) => (
                  <Badge key={tag} variant="outline" className="border-dashed" dir="auto">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : (
              /*
                Said out loud rather than left blank. No tags means the catalog
                is unfiltered, and "nothing recorded" and "nothing to record"
                are the two readings a blank space cannot tell apart. This is
                the one absence on the page worth a sentence.
              */
              <p className="text-body-sm text-muted-foreground">{t('intake.noAllergens')}</p>
            )}

            <Facts>
              <Fact label={t('intake.allergyDetailLabel')} value={intake.allergies} block />
              <Fact label={t('fields.conditions')} value={intake.conditions} block />
              <Fact label={t('fields.medications')} value={intake.medications} block />
            </Facts>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle icon="weeklyPlans" className="text-base">
              {t('intake.sections.planning')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Facts>
              <Fact
                label={t('fields.permanentInstructions')}
                value={intake.permanentInstructions}
                block
              />
              <Fact label={t('fields.preferences')} value={intake.preferences} block />
              <Fact label={t('fields.dislikes')} value={intake.dislikes} block />
            </Facts>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle icon="notes" className="text-base">
              {t('intake.sections.private')}
            </CardTitle>
            <Badge variant="muted">{t('intake.privateBadge')}</Badge>
          </CardHeader>
          <CardContent>
            <Facts columns={1}>
              <Fact label={t('fields.medicalNotes')} value={intake.medicalNotes} block />
              <Fact label={t('fields.notes')} value={intake.notes} block />
            </Facts>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle icon="clock" className="text-base">
              {t('intake.sections.schedule')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {intake.mealSchedule.length > 0 ? (
              intake.mealSchedule.map((slot) => (
                <span
                  key={slot.slotKey}
                  className="flex items-baseline gap-2 rounded-md bg-muted px-3 py-2 text-body-sm"
                >
                  <span className="font-medium" dir="auto">
                    {slot.label}
                  </span>
                  <span className="text-caption tabular-nums text-muted-foreground" dir="ltr">
                    {slot.timeOfDay} · {Math.round(slot.kcalShare * 100)}%
                  </span>
                </span>
              ))
            ) : (
              <p className="text-body-sm text-muted-foreground">{t('intake.noSchedule')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle icon="profile" className="text-base">
              {t('intake.sections.portal')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Facts columns={1}>
              <Fact
                label={t('intake.shareWeight')}
                value={intake.shareWeightWithClient ? t('intake.shared') : t('intake.notShared')}
              />
              <Fact label={t('fields.careNote')} value={intake.careNote} block />
            </Facts>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * A definition grid.
 *
 * `<dl>` rather than a stack of divs: these are label/value pairs and saying so
 * is free. Renders nothing at all when every child is absent, which is what
 * lets a card hold only what is known.
 */
function Facts({ columns = 3, children }: { columns?: 1 | 3; children: React.ReactNode }) {
  const rendered = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(rendered) && rendered.length === 0) return null;

  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1',
      )}
    >
      {children}
    </dl>
  );
}

/**
 * One known fact. **Renders nothing when there is nothing to say.**
 *
 * That is the whole difference from the previous version, which drew a label
 * and the words "not provided" for every empty field. The count of what is
 * missing is reported once, at the top, next to the control that fixes it.
 */
function Fact({
  label,
  value,
  unit,
  note,
  block = false,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  note?: string;
  block?: boolean;
}) {
  if (value === null || value === '') return null;

  const numeric = typeof value === 'number';

  return (
    <div className={cn('min-w-0', block && 'col-span-full sm:col-span-1')}>
      <dt className="text-label font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-1 text-body-sm text-foreground',
          numeric && 'font-heading text-heading-sm font-semibold tabular-nums',
          block && 'whitespace-pre-line [overflow-wrap:anywhere]',
        )}
        dir={numeric ? 'ltr' : 'auto'}
      >
        {value}
        {unit ? (
          <span className="ms-1 text-caption font-normal text-muted-foreground">{unit}</span>
        ) : null}
      </dd>
      {note ? <p className="mt-0.5 text-caption text-muted-foreground">{note}</p> : null}
    </div>
  );
}
