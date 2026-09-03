'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Dialog, DialogHeader } from '@/components/ui/dialog';
import { useDialogPresence } from '@/components/ui/dialog-motion';
import { Icon, type IconName } from '@/components/ui/icon';
import { toast } from '@/components/ui/toast';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { useRouter } from '@/i18n/navigation';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { type IsoDate } from '@/lib/iso-date';

import { type ReadReportState } from '../report-state';

import { MeasurementForm, type MeasurementFormValues } from './measurement-form';
import { ReportUpload } from './report-upload';

/**
 * The card a measurement is written on, and the control that opens it.
 *
 * The same split `ClientFormTrigger` makes: this component is the button half —
 * it owns the open state and hands focus back afterwards — and `MeasurementForm`
 * is the card's body. Recording a reading happens over the record the dietitian
 * is already reading; there is no `/measurements/new` page, for the same reason
 * there is no `/clients/new`.
 *
 * ## Two ways in, one form
 *
 * `mode="upload"` opens on the file picker and swaps to the form once the report
 * has been read; `mode="manual"` opens straight onto the form. Both land on the
 * *same* form — see its note on why the confirm screen is not a screen of its
 * own. Upload is one step longer and never a different destination.
 *
 * A machine we cannot read is therefore not a dead end: the reader returns an
 * empty draft with a warning, the form opens anyway, and the dietitian types the
 * figures with the PDF already attached to the record.
 *
 * ## Why the card is portalled to `<body>`
 *
 * The trigger sits inside the Measurements panel, which is itself inside the
 * record's tab panel. A `<form>` nested in another is invalid HTML and the
 * browser resolves it by quietly dropping one — see `ClientFormDialog`'s note.
 * `<dialog>` renders in the top layer regardless of where it is in the tree.
 */
export function MeasurementFormTrigger({
  clientId,
  locale,
  today,
  currentWeightKg,
  label,
  measurement,
  mode = 'manual',
  variant = 'default',
  icon = 'add',
}: {
  clientId: string;
  locale: Locale;
  today: IsoDate;
  currentWeightKg: number | null;
  label: string;
  /** Editing an existing reading. Absent records a new one. */
  measurement?: MeasurementFormValues;
  /** `upload` opens on the file picker first. Editing is always `manual`. */
  mode?: 'manual' | 'upload';
  /**
   * `default` is the panel's own button. `ghost` is the same control shrunk into
   * a table row, where an outlined box among other boxless cells would read as
   * one more destination — the distinction the design system draws is about what
   * a control sits among, not how important it is.
   */
  variant?: 'default' | 'ghost' | 'outline';
  icon?: IconName;
}) {
  const t = useTranslations('measurements');
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<{
    state: Extract<ReadReportState, { status: 'ready' }>;
    file: File;
  } | null>(null);

  const dialogPresent = useDialogPresence(open);
  const trigger = useRef<HTMLButtonElement>(null);

  /*
    Focus goes back to the button the card was opened from. Without it, closing
    the dialog drops focus onto `<body>` and a keyboard reader restarts at the
    top of the page — which on this screen is the navigation rail, several
    hundred pixels from where they were.
  */
  const close = useCallback(() => {
    setOpen(false);
    setRead(null);
    trigger.current?.focus();
  }, []);

  const handleRead = useCallback(
    (state: Extract<ReadReportState, { status: 'ready' }>, file: File) => {
      setRead({ state, file });
    },
    [],
  );

  const handleSaved = useCallback(
    (state: { currentWeight: 'untouched' | 'applied' | 'noProfile'; weightKg: number }) => {
      close();

      /*
        Three outcomes, not two. Ticking "make this the current weight" for a
        client whose intake has never been saved updates nothing — there is no
        nutrition profile row yet — and saying only "saved" would leave the
        dietitian believing the calorie target had moved. See
        `applyWeightToProfile`.

        `noProfile` is the one that has to be read, so it goes out as a warning
        rather than a success: it is the only case where the dietitian asked for
        something and did not get it.
      */
      if (state.currentWeight === 'applied') {
        toast.success(t('flash.savedAndApplied', { weight: state.weightKg.toFixed(1) }));
      } else if (state.currentWeight === 'noProfile') {
        toast.warning(t('flash.savedNoProfile'));
      } else {
        toast.success(t('flash.saved'));
      }

      // The panel is a server component; the new row and every delta on the
      // screen come from a fresh read rather than from client state.
      router.refresh();
    },
    [close, router, t],
  );

  // The file picker is only the first step of an upload, and only until it has
  // produced something.
  const showUpload = mode === 'upload' && !measurement && read === null;

  const title = measurement
    ? t('form.editTitle')
    : mode === 'upload'
      ? read
        ? t('upload.checkTitle')
        : t('upload.title')
      : t('form.addTitle');

  return (
    <>
      {variant === 'ghost' ? (
        // Icon-only in a row: the label becomes the accessible name and the
        // tooltip, so the cell stays narrow without the control going unnamed.
        <TooltipHint label={label}>
          <Button
            ref={trigger}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={() => setOpen(true)}
          >
            <Icon name={icon} className="size-4" />
          </Button>
        </TooltipHint>
      ) : (
        <Button
          ref={trigger}
          type="button"
          variant={variant}
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1.5"
        >
          <Icon name={icon} className="size-4" />
          {label}
        </Button>
      )}

      {dialogPresent
        ? createPortal(
            <Dialog
              open={open}
              onClose={close}
              label={title}
              dir={getLocaleDirection(locale)}
              size={showUpload ? 'default' : 'page'}
            >
              <DialogHeader title={title} onClose={close} />

              {showUpload ? (
                <div className="p-4 sm:p-5">
                  <ReportUpload clientId={clientId} locale={locale} onRead={handleRead} />
                </div>
              ) : (
                <MeasurementForm
                  clientId={clientId}
                  locale={locale}
                  today={today}
                  currentWeightKg={currentWeightKg}
                  measurement={measurement}
                  report={
                    read
                      ? {
                          parsed: read.state.report,
                          warnings: read.state.warnings,
                          file: read.file,
                          fileName: read.state.file.name,
                          found: read.state.found,
                          total: read.state.total,
                          onReplace: () => setRead(null),
                        }
                      : undefined
                  }
                  onCancel={close}
                  onSaved={handleSaved}
                />
              )}
            </Dialog>,
            document.body,
          )
        : null}
    </>
  );
}
