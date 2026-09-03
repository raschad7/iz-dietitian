'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { isMember } from '@/lib/enum';

import { reviewPlanAction } from '../actions';
import { initialReviewState } from '../form-state';
import type { PlanReviewRow } from '../queries';
import { REVIEW_SEVERITIES, REVIEW_VERDICTS } from '../review';

/**
 * Written out as whole message keys rather than built from a day name, because
 * `useTranslations` types its argument as a union of the keys that exist — a
 * template string is not one of them, and the check is worth keeping.
 */
const DAY_KEYS = [
  'days.sunday',
  'days.monday',
  'days.tuesday',
  'days.wednesday',
  'days.thursday',
  'days.friday',
  'days.saturday',
] as const;

/**
 * What the model said about this week, and the button that asks it.
 *
 * Read, never applied. The findings sit beside the week rather than rearranging
 * it, because a dietitian who sees the critique and decides is in charge of her
 * own plan and one whose week silently changed under her is not — and because the
 * first thing a reviewer catches is often a catalog bug (a dish named فلافل with
 * no fried falafel in it), which is not a thing to fix by swapping a meal.
 *
 * The wait is real — a reasoning model takes half a minute over a week — so the
 * button holds a spinner and says so rather than appearing to do nothing.
 */
export function PlanReviewCard({
  planId,
  locale,
  review,
}: {
  planId: string;
  locale: string;
  review: PlanReviewRow | null;
}) {
  const t = useTranslations('weeklyPlans');
  const format = useFormatter();
  const [state, formAction] = useActionState(reviewPlanAction, initialReviewState);

  const verdict = review && isMember(REVIEW_VERDICTS, review.verdict) ? review.verdict : null;

  return (
    <div className="flex flex-col gap-2.5 px-3 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption font-semibold text-muted-foreground">{t('review.title')}</p>

        {verdict ? (
          <Badge
            variant={
              verdict === 'usable' ? 'onTrack' : verdict === 'needs_work' ? 'attention' : 'muted'
            }
          >
            {t(`review.verdict.${verdict}`)}
          </Badge>
        ) : null}
      </div>

      {review ? (
        <>
          <p className="text-body-sm text-foreground">{review.summaryAr}</p>

          {review.findings.length ? (
            <ul className="flex flex-col gap-2">
              {review.findings.map((finding, index) => {
                const dayKey = finding.dayOfWeek === null ? null : DAY_KEYS[finding.dayOfWeek];

                return (
                <li
                  key={`${finding.slotKey}-${finding.dayOfWeek ?? 'week'}-${index}`}
                  className="rounded-md border border-border bg-background p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5 pb-1">
                    {isMember(REVIEW_SEVERITIES, finding.severity) ? (
                      <Badge
                        variant={finding.severity === 'high' ? 'attention' : 'muted'}
                      >
                        {t(`review.severity.${finding.severity}`)}
                      </Badge>
                    ) : null}

                    <span className="text-caption text-muted-foreground">
                      {dayKey ? t(dayKey) : t('review.week')}
                    </span>
                  </div>

                  <p className="text-body-sm">{finding.problemAr}</p>
                  <p className="pt-1 text-body-sm text-muted-foreground">
                    {t('review.suggestion')}: {finding.suggestionAr}
                  </p>
                </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-body-sm text-muted-foreground">{t('review.noFindings')}</p>
          )}

          {/*
            The arithmetic behind the opinion, folded away.

            It is what the code found before the model was asked, and the model
            was told not to repeat it — so it belongs beside the findings and
            under them, not in front of a reader who wants the judgement.
          */}
          {review.checks.length ? (
            <Disclosure icon="notes" title={`${t('review.checks')} (${review.checks.length})`}>
              <ul className="flex list-inside list-disc flex-col gap-1 pt-1.5 text-caption text-muted-foreground">
                {review.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </Disclosure>
          ) : null}

          <p className="text-caption text-muted-foreground">
            {t('review.reviewedAt')} {format.dateTime(review.createdAt, 'date')} · {review.model}
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-body-sm text-foreground">{t('review.empty')}</p>
          <p className="text-caption text-muted-foreground">{t('review.emptyHint')}</p>
        </div>
      )}

      {state.status === 'error' ? (
        <p className="text-body-sm text-destructive">
          {t(state.messageKey)}
          {state.detail ? <span className="block text-caption">{state.detail}</span> : null}
        </p>
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="planId" value={planId} />
        <SubmitButton label={review ? t('review.again') : t('review.run')} busy={t('review.running')} />
      </form>
    </div>
  );
}

/**
 * Its own component so `useFormStatus` has a form above it to read — the hook
 * reports the status of the form it is rendered inside, not of one it is beside.
 */
function SubmitButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="neutral" size="sm" disabled={pending} className="w-full">
      {pending ? <Spinner /> : <Icon name="ai" />}
      {pending ? busy : label}
    </Button>
  );
}
