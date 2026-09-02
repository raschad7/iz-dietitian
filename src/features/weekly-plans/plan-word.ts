/**
 * The same printed week, saved as a Word document.
 *
 * ## It re-reads the DOM rather than re-rendering the plan
 *
 * `PlanPrintDocument` has already put the whole sheet in the page — a `<table>`
 * of days and slots, hidden until the print stylesheet asks for it. So this
 * takes that element's `outerHTML` and wraps it, rather than building a second
 * renderer over `PrintPlan`.
 *
 * That is the point. Two builders would be two things to keep in step, and the
 * failure would be quiet: a PDF and a `.doc` of the same week that disagree
 * about a dish. Here the structure is produced exactly once, by React, and both
 * exports are the same nodes — one photographed by the printer, one serialised
 * to a file.
 *
 * ## Why `.doc` and not `.docx`
 *
 * `.docx` is a zip of XML parts and needs a library to write. `.doc` here is not
 * the old binary format either — it is HTML with Word's namespace declarations,
 * which Word has opened natively since Word 2000 and which Pages and LibreOffice
 * read too. Zero dependencies, and the dietitian gets a file they can edit,
 * which is the reason to want Word at all.
 *
 * ## Why it carries its own stylesheet
 *
 * Word's rendering engine is not a browser. It has no CSS grid, no custom
 * properties, no logical properties, and no `@media`. The print rules in
 * `globals.css` are written for paper via a modern engine and would mostly be
 * ignored — so the styles below are a *port*, not a copy, and are kept as small
 * as a table needs: borders, weights, sizes. Anything directional is avoided
 * outright, so Arabic works from `dir="rtl"` alone rather than from properties
 * Word may not honour.
 */

/**
 * The byte order mark Word needs to read the file as UTF-8.
 *
 * Written as an escape rather than pasted in: the character is invisible, and
 * an invisible character load-bearing enough that Arabic opens as mojibake
 * without it should not be something a reader has to notice is there.
 */
const BOM = '\ufeff';

/** Word's page setup. Portrait A4 — this is prose with a table in it. */
const WORD_PAGE = `
  @page WordSection1 {
    size: 21cm 29.7cm;
    margin: 1.6cm 1.4cm;
  }
  div.WordSection1 { page: WordSection1; }
`;

/**
 * The table, ported.
 *
 * Literal hex rather than the `--n-*` / `--green-*` primitives these mirror:
 * Word resolves no custom properties, so a `var()` here is a colour that
 * silently comes out black. They are the same steps `globals.css` prints with
 * — n-900, n-700, n-600, n-500, n-400, n-200 and green-700 — and must be
 * changed together with it.
 *
 * Physical `margin-left`/`margin-right` in pairs rather than the logical
 * properties the print sheet uses: Word honours neither `margin-inline-*` nor
 * `border-inline-*`, so anything directional is stated symmetrically and the
 * page's direction comes from `dir="rtl"` alone.
 */
const WORD_STYLES = `
  body {
    font-family: "Segoe UI", "Arial", sans-serif;
    font-size: 10.5pt;
    color: #1C1B17;
    line-height: 1.5;
  }
  p { margin: 0; }

  .plan-print-masthead {
    border-bottom: 1.5pt solid #1C1B17;
    padding-bottom: 8pt;
    margin-bottom: 16pt;
  }
  .plan-print-clinic { font-size: 9.5pt; color: #605D50; margin: 0 0 1pt 0; }
  .plan-print-client { font-size: 24pt; font-weight: bold; margin: 0 0 2pt 0; }
  .plan-print-facts { font-size: 10pt; color: #46443B; margin: 0; }
  .plan-print-facts span { margin-right: 14pt; margin-left: 14pt; }
  .plan-print-target { font-weight: bold; color: #1C1B17; }

  .plan-print-caveat {
    border-top: 0.75pt solid #A8A493;
    border-bottom: 0.75pt solid #A8A493;
    padding: 5pt 0;
    margin: 0 0 16pt 0;
    font-size: 9.5pt;
    color: #46443B;
  }
  .plan-print-caveat span { margin-right: 12pt; margin-left: 12pt; }

  .plan-print-day { margin-bottom: 18pt; }
  .plan-print-day-head {
    border-bottom: 2pt solid #346E1D;
    padding-bottom: 4pt;
    margin-bottom: 6pt;
  }
  .plan-print-day-name { font-size: 14pt; font-weight: bold; }
  .plan-print-day-date { font-size: 10pt; color: #605D50; margin-right: 8pt; margin-left: 8pt; }
  .plan-print-day-kcal { font-size: 11pt; font-weight: bold; }
  .plan-print-day-macro { font-size: 9.5pt; color: #605D50; margin-right: 8pt; margin-left: 8pt; }

  table.plan-print-meals {
    border-collapse: collapse;
    width: 100%;
    table-layout: fixed;
  }
  table.plan-print-meals th,
  table.plan-print-meals td {
    border: 0;
    border-top: 0.5pt solid #E2DFD3;
    padding: 7pt 0;
    vertical-align: top;
    text-align: start;
  }
  .plan-print-meal-when { width: 2.6cm; }
  .plan-print-meal-slot { font-size: 10.5pt; font-weight: bold; display: block; }
  .plan-print-meal-time { font-size: 9.5pt; font-weight: normal; color: #605D50; display: block; }

  .plan-print-dish { font-size: 12pt; font-weight: bold; margin: 0; }
  .plan-print-portions { font-size: 10pt; color: #46443B; margin: 3pt 0 0 0; }
  .plan-print-amount { font-weight: bold; color: #1C1B17; }
  .plan-print-sep { color: #A8A493; }
  .plan-print-side { font-weight: bold; color: #1C1B17; }
  .plan-print-alts { font-size: 9.5pt; color: #605D50; margin: 4pt 0 0 0; }
  .plan-print-alts-label { font-weight: bold; color: #46443B; }
  .plan-print-alt-kcal { color: #837F6E; }

  .plan-print-meal-kcal {
    width: 2cm;
    text-align: end;
    font-size: 10.5pt;
    font-weight: bold;
  }
`;

/**
 * Wraps an already-rendered sheet in a document Word will open.
 *
 * Exported for the test: the shell is small but every part of it is load-bearing
 * — drop the namespaces and Word opens it as a web page in a browser instead.
 */
export function wordDocument({
  body,
  title,
  dir,
  lang,
}: {
  /** The sheet's `outerHTML`, exactly as the browser rendered it. */
  body: string;
  title: string;
  dir: string;
  lang: string;
}): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${WORD_PAGE}${WORD_STYLES}</style>
</head>
<body dir="${dir}" lang="${lang}">
<div class="WordSection1">${body}</div>
</body>
</html>`;
}

/** The document title is interpolated into markup; a client's name is free text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Saves the rendered sheet as `<fileName>.doc`.
 *
 * Throws when the sheet is not in the DOM. That is not defensive noise: it is
 * the one way this can fail, and a button that quietly does nothing is worse
 * than one that says it could not. The caller turns it into a toast.
 */
export function downloadPlanAsWord({
  root,
  fileName,
}: {
  /** The rendered `.plan-print` element, or null if it was not found. */
  root: HTMLElement | null;
  /** Without an extension — this adds `.doc`. */
  fileName: string;
}): void {
  if (!root) throw new Error('The printable plan is not rendered.');

  const html = wordDocument({
    body: root.outerHTML,
    title: fileName,
    dir: root.dir || 'ltr',
    lang: root.lang || 'en',
  });

  /*
    The BOM is what tells Word the bytes are UTF-8. Without it the `<meta
    charset>` is not enough on Windows — Word falls back to the system codepage
    and an Arabic plan opens as mojibake.
  */
  const blob = new Blob([BOM, html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.doc`;
  /* Appended before clicking: a detached anchor's click is ignored by Firefox. */
  document.body.append(link);
  link.click();
  link.remove();

  /* Not revoked inline — the download may not have started reading the blob by
     the time this statement returns, and Safari cancels it if the URL is gone. */
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
