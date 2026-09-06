import { getTranslations } from 'next-intl/server';

import { SegmentedGroup, SegmentedOption } from '@/components/ui/segmented';
import type { Locale } from '@/i18n/routing';

import { USAGE_RANGES, type UsageRange } from '../ai-usage';
import { QueryForm } from './query-form';

/**
 * How far back the screen is looking — the last 7, 30 or 90 days, or everything.
 *
 * **Still a GET form, and each segment is still a real submit button** carrying
 * the value it selects. Keeping the range in the URL rather than in component
 * state is what makes the window bookmarkable, sendable to someone else, and
 * reachable with the back arrow; there is nothing to render faster by holding it
 * client-side either, since every figure on the page comes from the database.
 *
 * **What changed is how the submit travels.** It used to be a document
 * navigation — the browser throwing the page away and asking for a new one — and
 * a fresh document is indistinguishable from the application starting, so
 * pressing "90 days" played the launch screen over the answer. `QueryForm`
 * intercepts the submit and pushes through the router instead; with JavaScript
 * off the browser submits it the old way and the screen still works.
 */
export async function UsageRangeTabs({
  current,
  locale,
  /**
   * Which screen the range belongs to. The AI screen was the only caller when
   * this was written and hardcoded its own path; the overview now shares the
   * control, and a range picker that navigates away from the page it is on is
   * the worst kind of bug — it works.
   */
  basePath = '/admin/ai',
}: {
  current: UsageRange;
  locale: Locale;
  basePath?: string;
}) {
  const t = await getTranslations('admin.ai.ranges');

  return (
    <QueryForm path={basePath} locale={locale}>
      <SegmentedGroup label={t('label')}>
        {USAGE_RANGES.map((range) => (
          <SegmentedOption key={range} type="submit" name="range" value={range} selected={range === current}>
            {t(range)}
          </SegmentedOption>
        ))}
      </SegmentedGroup>
    </QueryForm>
  );
}
