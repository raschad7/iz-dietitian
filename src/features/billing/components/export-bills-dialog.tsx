'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import {
  PanelTabs,
  PanelTabsList,
  PanelTabsPanel,
  PanelTabsTrigger,
} from '@/components/ui/panel-tabs';
import { SelectField } from '@/components/ui/select-field';
import { cn } from '@/lib/utils';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

/** The files a clinic can take away, and the mark each is drawn with. */
const FORMATS: { value: string; icon: IconName; label: string }[] = [
  { value: 'csv', icon: 'formatCsv', label: 'CSV' },
  { value: 'xlsx', icon: 'formatXlsx', label: 'XLSX' },
  { value: 'pdf', icon: 'formatPdf', label: 'PDF' },
];

const PERIODS = ['thisMonth', 'last3', 'thisYear', 'all', 'custom'] as const;
type Period = (typeof PERIODS)[number];

/** How much of the ledger a file carries: every bill, or one line a patient. */
const LEVELS = ['detailed', 'summary'] as const;
type Level = (typeof LEVELS)[number];

/** The tile the format marks are drawn as, checked or not. */
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
 * ## Three questions, three shapes
 *
 * They were three sets of radio tiles, on the argument that a surface opened
 * rarely should show every option at once. That argument holds for exactly one
 * of the three:
 *
 * - **Detail level** is two views of the same export, and the sentence
 *   explaining each is the whole decision — so it is `PanelTabs`, with the hint
 *   as the chosen tab's panel rather than two paragraphs open at once.
 * - **File format** keeps its tiles. Three glyphs in a row, read at a glance,
 *   costing one line; nothing about them is better in a list you have to open.
 *   The inputs are `sr-only` where the tile carries the mark, which keeps the
 *   arrow-key navigation and the grouping a screen reader announces while
 *   letting the label do the drawing.
 * - **Duration** is five word-long presets that wrapped onto two reflowing
 *   rows — a select, and now `SelectField` like every other select in the app.
 *
 * The tabs and the select hold their value in state and post it through a
 * hidden input, so the form is still one `GET` the browser submits itself.
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
  const [level, setLevel] = useState<Level>('detailed');
  const [period, setPeriod] = useState<Period>('thisMonth');

  /*
    The custom range's two days, as ISO strings.

    Held here rather than left to the fields, because `DatePicker` is a
    controlled field and because the two bound each other — see the note beside
    them. They survive a switch to a preset and back for the reason the block
    below is hidden rather than unmounted: a range typed, abandoned and returned
    to is still there.
  */
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  /**
   * Moving the start past the end drops the end.
   *
   * The "to" field bounds its grid at `from`, which stops a bad range being
   * *picked* — but not one made backwards by moving the other end afterwards.
   * Clearing it is the honest resolution: the reader has just said the period
   * starts later than it used to end, so the end is a question again rather
   * than a value to quietly rewrite for them.
   *
   * Both are `YYYY-MM-DD`, so the comparison is a string one — the whole reason
   * dates cross this app as ISO strings.
   */
  function chooseFrom(next: string) {
    setFrom(next);
    if (to && next > to) setTo('');
  }

  return (
    <>
      {/*
        **Solid olive, white label — the screen's own action.**

        It was `neutral`, the quiet bordered box, because it stood in the
        archive toggle's slot and inherited its treatment. That was the wrong
        inheritance: the archive is a view you switch to and this is the one
        thing a reader *does* on Bills. The register's row ends with a solid
        "New patient" for the same reason, and Bills was the one screen in the
        app whose row had no filled control on it at all.

        `default` is that variant — `bg-primary`, `text-primary-foreground-white`,
        and `primary-hover` (green-600, two steps down the ramp) under the
        pointer. Named rather than spelled in classes here, so the export button
        follows the token the day the brand moves.
      */}
      <Button
        type="button"
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
            {/*
              **The detail level is two tabs, and the hint is the panel under
              them.**

              It was two stacked radio tiles, each carrying its own sentence of
              explanation — two paragraphs open at once for a choice that is one
              of two, which made the tallest block on the surface out of the
              smallest question on it. Tabs are the shape this system already
              gives "two views of the same thing" (`PanelTabs`), and the panel
              gives the chosen one its sentence while the other's waits behind
              its tab. The whole section is now one row and one line.

              `div` with a `label`, not a `fieldset`/`legend`: there are no radios
              in here any more, and a fieldset around a tablist would announce a
              group that the tablist already is. `PanelTabsList` takes the
              accessible name.
            */}
            <div className="flex flex-col gap-2">
              <span id="export-level-label" className="text-label font-semibold">
                {t('level.label')}
              </span>

              <PanelTabs value={level} onValueChange={(next) => setLevel(next as Level)}>
                <PanelTabsList label={t('level.label')} aria-labelledby="export-level-label">
                  {LEVELS.map((option) => (
                    <PanelTabsTrigger key={option} value={option}>
                      {t(`level.${option}`)}
                    </PanelTabsTrigger>
                  ))}
                </PanelTabsList>

                {/* The difference between the two is the whole decision and is
                    not guessable from the two words alone — so the chosen tab
                    always says what it will produce. */}
                {LEVELS.map((option) => (
                  <PanelTabsPanel
                    key={option}
                    value={option}
                    className="text-body-sm text-muted-foreground"
                  >
                    {t(`level.${option}Hint`)}
                  </PanelTabsPanel>
                ))}
              </PanelTabs>

              {/*
                The tabs are state, not a control, so the value reaches the route
                the way every other one does — as a field on this form. One
                hidden input rather than a `name` on a primitive, because the
                panels unmount and anything posted from inside one would go with
                them.
              */}
              <input type="hidden" name="level" value={level} />
            </div>

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

            {/*
              **The duration is a select.**

              Five mutually-exclusive presets, of which one is chosen and stays
              chosen — that is a select, and it was five wrapping tiles taking
              two rows to show four options nobody reads twice. The rule the
              format row follows ("a reader should see every option at once")
              holds for three marks in a row and stops holding at five word-long
              labels that reflow with the viewport.

              `SelectField` is the shared control, so this list opens, keys and
              reads the same as every other select in the app.
            */}
            <div className="flex flex-col gap-2">
              <label htmlFor="export-period" className="text-label font-semibold">
                {t('duration.label')}
              </label>

              <SelectField
                id="export-period"
                value={period}
                onValueChange={(next) => setPeriod(next as Period)}
                className="ps-4 text-start"
                options={PERIODS.map((value) => ({
                  value,
                  label: t(`duration.${value}`),
                }))}
              />

              {/* Posted by hand for the reason the level's is — see there. The
                  select is controlled here because the custom dates below hang
                  off its value. */}
              <input type="hidden" name="period" value={period} />

              {/*
                **The two custom days are `DatePicker`, the app's own date
                field.**

                They were bare `<input type="date">` with a hand-written border
                and radius — the browser's control, which looks like a different
                product in every browser and nothing like the calendar this
                clinic reads all day. `DatePicker` is the shared field: the same
                grid, the same caption ring of days, months and years, the same
                Arabic behaviour, and it renders its own hidden input so `from`
                and `to` still post exactly as they did.

                `caption="dropdowns"` on both, unlike the ledger's own date
                fields: those pick a day within a week or two of now, and this
                picks the start of a period that may be two years back — the
                months and years the dropdowns give are how you get there
                without walking the grid.

                The pair also bound each other — `from` can go no later than
                `to`, `to` no earlier than `from` — so a backwards range cannot
                be handed to the route at all. The route only reads them for
                `custom`, so what is left in them while a preset is chosen is
                still harmless.
              */}
              <div className={cn('flex gap-3 pt-1', period !== 'custom' && 'hidden')}>
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="export-from" className="text-body-sm text-muted-foreground">
                    {t('duration.from')}
                  </label>

                  <DatePicker
                    id="export-from"
                    name="from"
                    locale={locale}
                    value={from}
                    onChange={chooseFrom}
                    caption="dropdowns"
                    /* The chosen day in the brand green, not the neutral fill a
                       form field defaults to — see `selectedTone`. This popover
                       asks one question and the day it marks is its whole
                       answer, which is the case that variant exists for. */
                    selectedTone="primary"
                    placeholder={t('duration.from')}
                  />
                </div>

                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="export-to" className="text-body-sm text-muted-foreground">
                    {t('duration.to')}
                  </label>

                  <DatePicker
                    id="export-to"
                    name="to"
                    locale={locale}
                    value={to}
                    onChange={setTo}
                    /*
                      **The only bound on either field.** "From" reaches any day
                      of any month of any year the chooser offers — a clinic
                      exporting its whole third year is asking an ordinary
                      question. "To" is the one day that is not free: a range
                      ending before it starts is not a period, so everything
                      earlier than "from" is out of the grid rather than left to
                      be caught by an error message after the download failed.

                      The start day itself stays in — `from` and `to` on the
                      same day is a single day's bills, which is a real export.
                    */
                    min={from || undefined}
                    caption="dropdowns"
                    /* The chosen day in the brand green, not the neutral fill a
                       form field defaults to — see `selectedTone`. This popover
                       asks one question and the day it marks is its whole
                       answer, which is the case that variant exists for. */
                    selectedTone="primary"
                    placeholder={t('duration.to')}
                  />
                </div>
              </div>
            </div>
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
