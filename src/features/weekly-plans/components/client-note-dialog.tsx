'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Textarea } from '@/components/ui/textarea';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { savePlanClientNoteAction } from '../actions';
import { initialPlanActionState, type PlanActionState } from '../form-state';

/**
 * The note that goes to the client with this week's plan.
 *
 * The dietitian writes one under almost every plan she sends — "اشربي ٨ أكواب
 * ماء يومياً"، "المشي نصف ساعة بعد العشاء"، "لو تأخرتِ عن وجبة قدّميها ولا
 * تُلغيها". Before this she was typing it into WhatsApp *after* sending the
 * plan, so the note travelled separately from the week it was about, and a
 * client scrolling back to the plan a few days later did not have it.
 *
 * ## Three notes, three readers, and only this one is the client's
 *
 * The week already carries two other pieces of prose and neither is this.
 * `week_instructions` is what she tells the *model* before generating;
 * `summary_ar` is what the model tells *her* afterwards. This is what she tells
 * the *client* — and it is the only one the portal or a printed plan ever shows.
 * Merging any two of them would leak one audience's words to another.
 *
 * ## The row states the note rather than hiding it
 *
 * A menu row that opens an editor for something invisible is a row you have to
 * press to find out whether there is anything behind it. This one shows the note
 * itself, truncated — so a week with a note and a week without look different
 * from the outside, which is the fact the dietitian is actually checking before
 * she hands the plan over.
 */
export function PlanClientNoteDialog({
  planId,
  locale,
  note,
  className,
}: {
  planId: string;
  locale: Locale;
  /** What is stored. Null on a week nobody has written a note for. */
  note: string | null;
  className?: string;
}) {
  const t = useTranslations('weeklyPlans.clientNote');
  const [open, setOpen] = useState(false);
  /*
    Closed by the save, not by the press — the write is the only thing that
    knows it landed, and closing on the press would hide a failure behind a
    dialog that looked as though it had worked.

    Done inside the action, after its `await`, rather than in an effect watching
    the status: an effect that calls `setState` on every render where the status
    is already `done` schedules a cascading render for a transition that has
    long since happened. `SettingsEditDialog` closes itself the same way and
    says the same thing at greater length.
  */
  const [state, formAction, pending] = useActionState(async (previous: PlanActionState, data: FormData) => {
    const next = await savePlanClientNoteAction(previous, data);

    if (next.status === 'done') setOpen(false);

    return next;
  }, initialPlanActionState);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn('h-10 w-full max-w-none justify-start rounded-none px-3', className)}
        onClick={() => setOpen(true)}
      >
        <Icon name="notes" className="text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-start">{note?.trim() || t('empty')}</span>
        {note?.trim() ? <Icon name="check" className="text-primary" /> : null}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label={t('title')}
        dir={getLocaleDirection(locale)}
      >
        {/*
          Re-keyed on every opening, so a dialog dismissed mid-edit reopens
          holding what is stored rather than the abandoned text — the same rule
          `SettingsEditDialog` states for the same reason.
        */}
        <form key={String(open)} action={formAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="planId" value={planId} />

          <DialogHeader title={t('title')} description={t('hint')} />

          <DialogBody>
            <Textarea
              name="note"
              rows={6}
              maxLength={2000}
              defaultValue={note ?? ''}
              placeholder={t('placeholder')}
              autoFocus
            />

            {state.status === 'error' ? (
              <p role="alert" className="pt-2 text-body-sm text-destructive">
                {t('failed')}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter className="justify-end">
            <Button type="button" variant="neutral" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
