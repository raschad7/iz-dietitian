'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PopoverClose } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';

import { printFileName } from '../plan-print';
import { downloadPlanAsWord } from '../plan-word';

import { PRINT_ROOT_CLASS } from './plan-print-document';

/**
 * Opens the browser's print dialog on the plan, under a sensible file name.
 *
 * ## The file name is the whole trick
 *
 * "Save as PDF" is a destination inside every desktop print dialog, and the
 * name it proposes is `document.title`. Left alone that is the page's metadata
 * title — so every week of every client saves as `Weekly Plans.pdf`, and a
 * dietitian who sends three plans in a morning has three files they cannot tell
 * apart. Setting the title for the duration of the print is what turns "print
 * this page" into "download this plan".
 *
 * It is put back on `afterprint`, which fires whether the dialog was confirmed
 * or cancelled. The restore is deliberately not done straight after `print()`
 * returns: the call blocks on some platforms and returns immediately on others,
 * and racing the dialog would rename the file back before it is saved.
 */
function usePrintPlan(fileName: string): () => void {
  return useCallback(() => {
    const previousTitle = document.title;

    function restore() {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restore);
    }

    window.addEventListener('afterprint', restore);
    document.title = fileName;
    window.print();
  }, [fileName]);
}

/**
 * The two ways a week leaves this app, as two choices rather than two rows.
 *
 * ## Why this is a labelled pair and not two menu entries
 *
 * It started as one ghost row saying "Download as PDF", and adding Word beside
 * it would have made two — two lines of text in a list that also holds "compare
 * with last week" and "delete this plan". Nothing in that list tells you the
 * first two are the *same act in two formats*, or that they are the only rows
 * that hand you a file. A heading and a pair of equal buttons says both without
 * a word of explanation: same size, same shape, side by side, under one label.
 *
 * The caption under them is doing the other half of the work. "PDF" and "Word"
 * name file types, not outcomes — and the outcome is the thing worth knowing,
 * because it is the same one for both: the whole week on a single sheet.
 *
 * ## Why both close the menu
 *
 * `PopoverClose` for the same reason the delete row uses it: the menu has done
 * its job the moment either is pressed. A popover left standing behind the
 * print dialog is a menu you have to dismiss after cancelling a save, and one
 * left standing after a download is a menu nobody asked to keep.
 */
export function PlanExport({
  clinicName,
  clientName,
  weekStartDate,
}: {
  clinicName: string | null;
  clientName: string;
  weekStartDate: string;
}) {
  const t = useTranslations('weeklyPlans.export');
  const fileName = printFileName({ clinicName, clientName, weekStartDate });
  const print = usePrintPlan(fileName);

  function saveAsWord() {
    try {
      /*
        Read back the sheet React already rendered, rather than building the
        document a second time. `plan-word.ts` explains why that matters; the
        query is here because this is the only place that knows the file name.
      */
      downloadPlanAsWord({
        root: document.querySelector<HTMLElement>(`.${PRINT_ROOT_CLASS}`),
        fileName,
      });
    } catch {
      toast.error(t('failed'));
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-label font-semibold">{t('title')}</p>

      {/* Two equal columns, so neither format reads as the real one and the
          other as an afterthought. `h-auto` with stacked content because a
          40px row cannot hold a glyph above a word. */}
      <div className="grid grid-cols-2 gap-2">
        <PopoverClose
          render={
            <Button
              type="button"
              variant="neutral"
              className="h-auto max-w-none flex-col gap-1 px-2 py-3"
              onClick={print}
            />
          }
        >
          <Icon name="downloadPdf" className="size-5" />
          {t('pdf')}
        </PopoverClose>

        <PopoverClose
          render={
            <Button
              type="button"
              variant="neutral"
              className="h-auto max-w-none flex-col gap-1 px-2 py-3"
              onClick={saveAsWord}
            />
          }
        >
          <Icon name="downloadWord" className="size-5" />
          {t('word')}
        </PopoverClose>
      </div>

      <p className="text-caption text-muted-foreground">{t('hint')}</p>
    </div>
  );
}
