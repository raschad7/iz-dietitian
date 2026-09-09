'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogHeader } from '@/components/ui/dialog';
import { IntakeForm } from '@/features/clients/components/intake-form';
import type { ClientIntakeValues } from '@/features/clients/types';
import type { BodyMetrics } from '@/features/measurements/compare';
import type { NutritionRules } from '@/features/weekly-plans/nutrition-rules';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

/**
 * The intake dialog, opened without a session.
 *
 * `IntakeFormTrigger` cannot be used here: it opens by calling
 * `loadIntakeAction`, which goes through `requireStaffClinic` and redirects a
 * browser with no session to the sign-in page. So this mounts `IntakeForm`
 * directly on a fixture — the same split `/dev/measurements` makes, and for the
 * reason that harness writes down: the record is behind the staff guard and
 * browser automation may not enter a password, so without this the one screen
 * that had to be looked at was the one screen nobody could open.
 *
 * ⚠ It renders the form and nothing else works. Saving posts to the real server
 * action and will bounce to sign-in, which is correct and is not what this is
 * for — the question it answers is what the panel *looks* like, in particular
 * the body block that replaced the height and weight boxes.
 */
export function IntakeHarness({
  intake,
  locale,
  rules,
  metrics,
}: {
  intake: ClientIntakeValues;
  locale: Locale;
  rules: NutritionRules;
  metrics: BodyMetrics;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4">
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        افتحي نافذة التعديل
      </Button>

      {open ? (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          label="تعديل بيانات التغذية"
          dir={getLocaleDirection(locale)}
          flat
          className="h-[46rem] sm:w-[min(54rem,calc(100vw-3rem))]"
        >
          <DialogHeader
            title="تعديل بيانات التغذية"
            description={`لـ ${intake.fullName}`}
            className="px-4 pt-4 sm:px-5 sm:pt-5"
          />
          <IntakeForm
            intake={intake}
            locale={locale}
            rules={rules}
            metrics={metrics}
            onCancel={() => setOpen(false)}
            onSaved={() => setOpen(false)}
          />
        </Dialog>
      ) : null}
    </div>
  );
}
