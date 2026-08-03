'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { startEmptyWeekAction, startWeekFromPlanAction } from '../editor-actions';
import { initialNewWeekState } from '../form-state';

/**
 * The three doors into a plan.
 *
 * Generation is one entry among three rather than the page's primary action. A
 * returning client's next week is usually last week with a few meals changed, and
 * making that path go through a model was the whole problem.
 *
 * The generate door hands back to the caller instead of duplicating the generate
 * form here: the instruction box and the per-week targets are more content than
 * belongs in a menu, and two copies of them would drift apart.
 */
export function NewWeekMenu({
  clientId,
  weekStartDate,
  previousPlan,
  locale,
  blocked,
  onGenerate,
}: {
  clientId: string;
  weekStartDate: string;
  /** The most recent plan that is not the one already open. */
  previousPlan: { id: string; weekStartDate: string } | null;
  locale: string;
  blocked: boolean;
  onGenerate: () => void;
}) {
  const t = useTranslations('weeklyPlans');
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // A menu that survives a click elsewhere on the page reads as a stuck panel
  // rather than a menu. `pointerdown` rather than `click` so it closes on the
  // press, before whatever was clicked has acted.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={container}>
      <Button type="button" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {t('newWeek')}
      </Button>

      {open && (
        // `end-0` rather than `start-0`: the button sits at the inline end of the
        // header, and a menu anchored at the start would hang off the board in both
        // directions.
        <div className="absolute end-0 z-20 mt-1 w-72 rounded-md border border-border bg-background p-2 text-start shadow-md">
          {blocked ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {t('errors.profileIncomplete')}
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onGenerate();
                }}
                className="rounded-md p-2 text-start text-xs hover:bg-accent"
              >
                <span className="block font-medium">{t('newWeekGenerate')}</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {t('newWeekGenerateHint')}
                </span>
              </button>

              {previousPlan && (
                <CopyEntry
                  clientId={clientId}
                  sourcePlanId={previousPlan.id}
                  sourceWeek={previousPlan.weekStartDate}
                  weekStartDate={weekStartDate}
                  locale={locale}
                />
              )}

              <EmptyEntry clientId={clientId} weekStartDate={weekStartDate} locale={locale} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyEntry({
  clientId,
  sourcePlanId,
  sourceWeek,
  weekStartDate,
  locale,
}: {
  clientId: string;
  sourcePlanId: string;
  sourceWeek: string;
  weekStartDate: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(startWeekFromPlanAction, initialNewWeekState);

  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="sourcePlanId" value={sourcePlanId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <Entry title={t('newWeekFrom', { date: sourceWeek })} hint={t('newWeekFromHint')} />

      {state.status === 'error' && (
        <p className="px-2 text-xs text-destructive">{t(state.messageKey)}</p>
      )}
    </form>
  );
}

function EmptyEntry({
  clientId,
  weekStartDate,
  locale,
}: {
  clientId: string;
  weekStartDate: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(startEmptyWeekAction, initialNewWeekState);

  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <Entry title={t('newWeekEmpty')} hint={t('newWeekEmptyHint')} />

      {state.status === 'error' && (
        <p className="px-2 text-xs text-destructive">{t(state.messageKey)}</p>
      )}
    </form>
  );
}

function Entry({ title, hint }: { title: string; hint: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md p-2 text-start text-xs hover:bg-accent disabled:opacity-50"
    >
      <span className="block font-medium">{title}</span>
      <span className="mt-0.5 block text-muted-foreground">{hint}</span>
    </button>
  );
}
