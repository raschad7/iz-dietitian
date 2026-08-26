'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

/** The files a clinic can take away, and the mark each is drawn with. */
const FORMATS: { value: string; icon: IconName; label: string }[] = [
  { value: 'csv', icon: 'formatCsv', label: 'CSV' },
  { value: 'xlsx', icon: 'formatXlsx', label: 'XLSX' },
  { value: 'pdf', icon: 'formatPdf', label: 'PDF' },
];

const PERIODS = ['thisMonth', 'last3', 'thisYear', 'all', 'custom'] as const;

/** The tile every choice in here is drawn as, checked or not. */
const TILE =
  'cursor-pointer rounded-[10px] border border-border font-normal has-[:checked]:border-primary has-[:checked]:bg-primary/5';

/**
 * "Export bills" — every subscriber on the system, for a chosen period.
 *
 * ## A form, and a `GET`
 *
 * The answer is a file, so this submits to `bills/export` the way a link does
 * and lets the browser take the download. An action handing bytes back for a
 * script to wrap in a blob and click would be three steps to arrive at what
 * `Content-Disposition` already does, and it would stop working the moment
 * JavaScript did. Everything here is a native control inside a `<form>`, so the
 * reader gets the browser's own download with its own progress and its own
 * place to put the file.
 *
 * `method="get"` also makes an export a URL: a clinic that runs the same one
 * every month can bookmark it.
 *
 * ## Why radios rather than three buttons or a select
 *
 * Three short mutually-exclusive sets, on a surface that is opened rarely and
 * has to be read each time rather than one anybody builds muscle memory for. A
 * reader should see every option at once. The inputs are `sr-only` where the
 * tile carries the mark, which keeps the arrow-key navigation and the grouping
 * a screen reader announces while letting the label do the drawing.
 *
 * ## The custom dates
 *
 * Hidden rather than unmounted when another period is chosen, so a range typed,
 * abandoned and returned to is still there. The route reads them only for
 * `custom`, so a stale value cannot leak into a preset.
 */
export function ExportBillsDialog({ locale, className }: { locale: Locale; className?: string }) {
  const t = useTranslations('billing.export');
  const common = useTranslations('common');

  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<string>('thisMonth');

  return (
    <>
      <Button
        type="button"
        variant="neutral"
        onClick={() => setOpen(true)}
        className={cn('flex-1 max-sm:px-0 lg:flex-none', className)}
      >
        {/* The glyph leads, as it does on the controls beside it in this row. */}
        <Icon name="fileDown" />
        <span className="sr-only sm:not-sr-only">{t('action')}</span>
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label={t('title')}
        dir={getLocaleDirection(locale)}
      >
        <DialogHeader title={t('title')} description={t('description')} />

        {/*
          The whole surface is one form. Submitting navigates to the route,
          which answers with a file rather than a page, so the dialog is left
          standing exactly as it was — which is right: a clinic taking a CSV
          and then a PDF of the same period should not have to open this twice.
        */}
        <form action={`/${locale}/app/clients/bills/export`} method="get">
          <DialogBody className="gap-6 p-6">
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-2 text-label font-semibold">{t('level.label')}</legend>

              {(['detailed', 'summary'] as const).map((level, index) => (
                <Label key={level} className={cn(TILE, 'flex items-start gap-3 p-3')}>
                  <input
                    type="radio"
                    name="level"
                    value={level}
                    defaultChecked={index === 0}
                    className="mt-1 accent-primary"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{t(`level.${level}`)}</span>
                    {/* The difference between the two is the whole decision and
                        is not guessable from the two words alone. */}
                    <span className="text-body-sm text-muted-foreground">
                      {t(`level.${level}Hint`)}
                    </span>
                  </span>
                </Label>
              ))}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="pb-2 text-label font-semibold">{t('format.label')}</legend>

              <div className="flex gap-2">
                {FORMATS.map((format, index) => (
                  <Label
                    key={format.value}
                    className={cn(TILE, 'flex flex-1 flex-col items-center gap-1.5 p-3')}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={format.value}
                      defaultChecked={index === 0}
                      className="sr-only"
                    />
                    <Icon name={format.icon} className="size-6 text-muted-foreground" />
                    <span className="text-body-sm font-medium">{format.label}</span>
                  </Label>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="pb-2 text-label font-semibold">{t('duration.label')}</legend>

              <div className="flex flex-wrap gap-2">
                {PERIODS.map((value) => (
                  <Label key={value} className={cn(TILE, 'px-3 py-2 text-body-sm')}>
                    <input
                      type="radio"
                      name="period"
                      value={value}
                      checked={period === value}
                      onChange={() => setPeriod(value)}
                      className="sr-only"
                    />
                    {t(`duration.${value}`)}
                  </Label>
                ))}
              </div>

              <div className={cn('flex gap-3 pt-1', period !== 'custom' && 'hidden')}>
                <Label className="flex flex-1 flex-col gap-1 font-normal">
                  <span className="text-body-sm text-muted-foreground">{t('duration.from')}</span>
                  <input
                    type="date"
                    name="from"
                    className="h-10 rounded-[10px] border border-border bg-card px-3 text-body-sm"
                  />
                </Label>

                <Label className="flex flex-1 flex-col gap-1 font-normal">
                  <span className="text-body-sm text-muted-foreground">{t('duration.to')}</span>
                  <input
                    type="date"
                    name="to"
                    className="h-10 rounded-[10px] border border-border bg-card px-3 text-body-sm"
                  />
                </Label>
              </div>
            </fieldset>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="neutral" onClick={() => setOpen(false)}>
              {common('cancel')}
            </Button>

            {/* A plain submit, so the browser performs the navigation itself and
                the download is the browser's rather than a script's. */}
            <button type="submit" className={cn(buttonVariants({ variant: 'default' }))}>
              <Icon name="fileDown" />
              {t('submit')}
            </button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
