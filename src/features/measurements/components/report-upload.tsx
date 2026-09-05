'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { readReportAction } from '../actions';
import { initialReadReportState, type ReadReportState } from '../report-state';
import { MEASUREMENT_FILE_TYPES } from '../schema';

/**
 * Step one of reading a report: pick the file, and see what came out of it.
 *
 * **This step saves nothing.** It posts the PDF to `readReportAction`, which
 * parses and hands back a draft; the figures then seed the ordinary measurement
 * form, which is the only thing that writes. See that action's note for why the
 * split is not negotiable.
 *
 * The file is held in this form's own input and submitted a second time with the
 * save, rather than parked on the server between the two steps — a few hundred
 * kilobytes sent twice is cheaper than a draft store that needs sweeping for
 * every upload somebody abandoned.
 */
export function ReportUpload({
  clientId,
  locale,
  onRead,
}: {
  clientId: string;
  locale: Locale;
  /** The draft, plus the file that produced it, for the confirm step. */
  onRead: (state: Extract<ReadReportState, { status: 'ready' }>, file: File) => void;
}) {
  const t = useTranslations('measurements');
  const [state, formAction] = useActionState(readReportAction, initialReadReportState);
  const form = useRef<HTMLFormElement>(null);

  /*
    ⚠ The File is captured when it is **picked**, not read back off the input
    when the action returns.

    The input is not a reliable place to keep it across the round trip: the
    action resolving re-renders this form, and an input that has been through
    that may no longer hold the `FileList` it was given. Reading it late meant
    the parse succeeded — the right device, all twelve figures — and the screen
    then sat on the file picker as though nothing had happened, because the
    handler below had nothing to hand on.

    A ref is written during the change event, before any of that, and the file
    itself has to survive anyway: it is submitted a second time with the save.
  */
  const picked = useRef<File | null>(null);

  useEffect(() => {
    if (state.status !== 'ready') return;

    const file = picked.current;
    if (file) onRead(state, file);
  }, [state, onRead]);

  return (
    <form ref={form} action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />

      <label
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed',
          'border-border bg-secondary/40 px-6 py-8 text-center transition-colors hover:bg-secondary',
        )}
      >
        <Icon name="bills" className="size-8 text-muted-foreground" />
        <span className="text-body font-medium">{t('upload.drop')}</span>
        <span className="text-caption text-muted-foreground">{t('upload.dropHint')}</span>
        <input
          type="file"
          name="report"
          accept={MEASUREMENT_FILE_TYPES.join(',')}
          className="sr-only"
          /*
            Submits the moment a file is chosen. A separate "Read" button would
            be a second press for a step that has exactly one possible next
            action, and the reader is watching for the figures either way.
          */
          onChange={(event) => {
            picked.current = event.target.files?.[0] ?? null;
            form.current?.requestSubmit();
          }}
        />
      </label>

      {state.status === 'error' ? (
        <Callout tone="attention">{t(state.messageKey)}</Callout>
      ) : null}

      <ReadingIndicator label={t('upload.reading')} />
    </form>
  );
}

function ReadingIndicator({ label }: { label: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 text-body text-muted-foreground"
    >
      <Spinner className="size-4" />
      {label}
    </p>
  );
}

/**
 * What was read, above the form it filled.
 *
 * Names the machine and how much of the sheet it understood, because "21 of 24
 * figures found" is the difference between a reader that worked and one that
 * half worked — and the three it missed are the boxes the dietitian has to look
 * at hardest.
 */
export function ReportSummary({
  device,
  fileName,
  found,
  total,
  onReplace,
}: {
  device: string | null;
  fileName: string;
  found: number;
  total: number;
  onReplace: () => void;
}) {
  const t = useTranslations('measurements');

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3">
      <Icon name="bills" className="size-6 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium">{fileName}</p>
        <p className="text-caption text-muted-foreground">
          {device ? (
            <>
              {t('upload.readAs')} <b className="font-medium text-foreground">{device}</b> ·{' '}
            </>
          ) : (
            <>{t('upload.unknownMachine')} · </>
          )}
          {t('upload.found', { found, total })}
        </p>
      </div>

      <Button type="button" variant="ghost" size="sm" onClick={onReplace}>
        {t('upload.replace')}
      </Button>
    </div>
  );
}
