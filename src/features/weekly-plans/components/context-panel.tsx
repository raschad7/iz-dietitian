import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';
import { isMember, membersOf } from '@/lib/enum';

import type { ClientContext } from '../queries';
import { ALLERGENS } from '../schema';

/**
 * The client's clinical context, shown in the end-side rail until a meal is opened.
 *
 * Exactly the facts the dietitian asked to see before generating: target, goal,
 * BMI, allergies, preferences, dislikes, standing instructions, and the schedule.
 * Nothing is invented here — every value is either stored or derived by
 * `targets.ts`, and a value that has not been recorded says so rather than showing a
 * dash the reader has to interpret.
 *
 * The panel is shaped rather than stacked, because the ten facts are not read
 * equally often. The two figures the dietitian actually checks before generating —
 * the daily target and the BMI — are tiles at the top. The allergens are chips in
 * the medical colour, since they are the one fact that makes a plan wrong. The
 * prose — preferences, dislikes, standing instructions, medical notes — is read
 * once when the client is set up and skipped every time after, so it folds behind
 * a disclosure. The schedule is a table because it is a table.
 */
export function ContextPanel({ context }: { context: ClientContext }) {
  const t = useTranslations('weeklyPlans');
  const tGoals = useTranslations('clients.goal');
  const tActivity = useTranslations('clients.activity');

  const { targets, profile } = context;

  /*
   * The prose, gathered before rendering so the disclosure can be left out
   * entirely when the client has none of it. An empty "Preferences and
   * instructions" row that opens onto nothing is a worse answer than no row.
   */
  const notes: { key: string; label: string; body: string }[] = [];
  if (profile?.preferences) notes.push({ key: 'preferences', label: t('preferences'), body: profile.preferences });
  if (profile?.dislikes) notes.push({ key: 'dislikes', label: t('dislikes'), body: profile.dislikes });
  if (profile?.permanentInstructions) {
    notes.push({
      key: 'permanentInstructions',
      label: t('permanentInstructions'),
      body: profile.permanentInstructions,
    });
  }
  if (context.medicalNotes) {
    notes.push({ key: 'medicalNotes', label: t('medicalNotes'), body: context.medicalNotes });
  }

  const measurements =
    [
      profile?.weightKg !== null && profile?.weightKg !== undefined
        ? t('kg', { value: profile.weightKg })
        : null,
      context.heightCm !== null ? t('cm', { value: context.heightCm }) : null,
      context.age !== null ? t('years', { value: context.age }) : null,
      isMember(CLIENT_ACTIVITY_LEVELS, context.activityLevel)
        ? tActivity(context.activityLevel)
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || t('unset');

  return (
    <div className="flex flex-col gap-4 text-body-sm">
      <div>
        <h3 className="text-body-md font-semibold">{context.fullName}</h3>
        <Link
          href={`/app/weekly-plans/${context.clientId}/profile`}
          className="text-label text-primary underline-offset-2 hover:underline"
        >
          {profile ? t('editProfile') : t('createProfile')}
        </Link>
      </div>

      {targets.missing.length > 0 && (
        <p className="rounded-md bg-status-attention-bg px-2.5 py-2 text-body-sm text-status-attention-fg">
          {t('missingFields', {
            fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
          })}
        </p>
      )}

      {/* The two numbers that get read. Everything else on this panel is checked
          when something looks wrong; these two are checked every time. */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label={t('dailyTarget')}>
          {context.effectiveKcal === null ? (
            <span className="text-body-sm text-muted-foreground">{t('notComputable')}</span>
          ) : (
            <>
              <span className="text-heading-sm font-semibold tabular">
                {t('kcalValue', { value: context.effectiveKcal })}
              </span>
              {/* An overridden target must be distinguishable from a computed one —
                  otherwise nobody can tell whose number they are looking at. */}
              {profile?.dailyKcalTarget !== null && profile?.dailyKcalTarget !== undefined && (
                <Badge variant="outline" size="sm">
                  {t('override')}
                </Badge>
              )}
              {context.effectiveProteinGrams !== null && (
                <span className="text-caption text-muted-foreground">
                  {t('proteinTarget', { value: context.effectiveProteinGrams })}
                </span>
              )}
            </>
          )}
        </Stat>

        <Stat label={t('bmi')}>
          {targets.bmi === null ? (
            <Unset />
          ) : (
            <>
              <span className="text-heading-sm font-semibold tabular">{targets.bmi.toFixed(1)}</span>
              {targets.bmiCategory && (
                <span className="text-caption text-muted-foreground">
                  {t(`bmiCategories.${targets.bmiCategory}`)}
                </span>
              )}
            </>
          )}
        </Stat>
      </div>

      <Section label={t('allergies')}>
        {profile?.allergenTags.length ? (
          <span className="flex flex-wrap gap-1">
            {membersOf(ALLERGENS, profile.allergenTags).map((tag) => (
              /* Clay, the system's one alarm colour, and the only status that
                 describes an allergen. `outline` said "some tag"; this says
                 "medical". */
              <Badge key={tag} variant="medical">
                {t(`allergens.${tag}`)}
              </Badge>
            ))}
          </span>
        ) : (
          <Unset />
        )}
        {/* The prose sits under the tags: it carries detail six checkboxes cannot,
            and it is what goes to the model as context. */}
        {context.allergies && <span className="mt-1 block leading-relaxed">{context.allergies}</span>}
      </Section>

      <Section label={t('goal')}>
        {isMember(CLIENT_GOALS, context.goal) ? tGoals(context.goal) : <Unset />}
      </Section>

      <Section label={t('measurements')}>
        <span className="text-muted-foreground">{measurements}</span>
      </Section>

      {notes.length > 0 && (
        /* `<details>` rather than state: this panel is rendered on the server, and
           the keyboard, the screen reader and find-in-page all work with no wiring. */
        <details className="q-disclosure group">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md text-label font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo [&::-webkit-details-marker]:hidden">
            {t('sections.preferences')}
            <Icon
              name="chevronDown"
              className="size-4 shrink-0 transition-transform duration-(--duration-sweep) ease-(--ease-sweep) group-open:rotate-180"
            />
          </summary>

          <div className="flex flex-col gap-3 pt-1">
            {notes.map((note) => (
              <section key={note.key}>
                <h4 className="pb-0.5 text-label font-semibold text-muted-foreground">
                  {note.label}
                </h4>
                <p className="leading-relaxed">{note.body}</p>
              </section>
            ))}
          </div>
        </details>
      )}

      {profile && context.budgets.length > 0 && (
        <section>
          <h4 className="pb-1.5 text-label font-semibold text-muted-foreground">{t('schedule')}</h4>

          <TableRoot>
            <Table className="text-body-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('fields.slotLabel')}</TableHead>
                  <TableHead numeric>{t('fields.slotTime')}</TableHead>
                  <TableHead numeric>{t('nutrients.kcal')}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {context.budgets.map((slot) => (
                  <TableRow key={slot.slotKey} zebra>
                    <TableCell>{slot.label}</TableCell>
                    <TableCell numeric className="text-muted-foreground">
                      {slot.timeOfDay}
                    </TableCell>
                    <TableCell numeric>{slot.kcal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        </section>
      )}
    </div>
  );
}

/**
 * One of the two figures at the top of the panel.
 *
 * `Card` in the `tinted` variant rather than a hand-rolled tinted box: the fill,
 * the ring, the tail and the padding scale are all decisions this system has
 * already made once.
 */
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card variant="tinted" size="sm">
      <CardContent className="flex flex-col items-start gap-1">
        <span className="text-label text-muted-foreground">{label}</span>
        {children}
      </CardContent>
    </Card>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="pb-0.5 text-label font-semibold text-muted-foreground">
        {label}
      </h4>
      <div>{children}</div>
    </section>
  );
}

function Unset() {
  const t = useTranslations('weeklyPlans');
  return <span className="text-muted-foreground">{t('unset')}</span>;
}
