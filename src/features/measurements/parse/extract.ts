import { type ExtractedPage, type TextItem } from './types';

/**
 * Turns a PDF into text with positions.
 *
 * **Server-only.** `unpdf` is a build of PDF.js and has no business in a client
 * bundle; it is reached from the upload action and from `scripts/`, never from a
 * component.
 *
 * ## Why positions and not just text
 *
 * A Tanita result sheet's *labels are images*. The template — "Weight", "Fat %",
 * "Segmental Analysis" — is drawn as artwork, and only the filled-in numbers are
 * real text. Extracting the text alone yields a bare list of values with nothing
 * naming them, so the usual "find the label, take the number beside it" approach
 * has nothing to find. Where a value sits on the page is the only thing left
 * that identifies it. See `tanita-mc780.ts`.
 */

/** Only the first page is read: a result sheet is one page, and page two is marketing. */
export async function extractFirstPage(bytes: Uint8Array): Promise<ExtractedPage> {
  // Imported inside the function so the PDF.js build is only pulled in when a
  // file is actually being read, rather than on every request that touches this
  // feature's module graph.
  const { getDocumentProxy } = await import('unpdf');

  const pdf = await getDocumentProxy(bytes);
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  const items: TextItem[] = [];

  for (const entry of content.items as unknown[]) {
    const item = entry as { str?: unknown; transform?: unknown };
    if (typeof item.str !== 'string') continue;

    const text = item.str.trim();
    if (!text) continue;

    const transform = item.transform;
    if (!Array.isArray(transform) || transform.length < 6) continue;

    const x = Number(transform[4]);
    const rawY = Number(transform[5]);
    if (!Number.isFinite(x) || !Number.isFinite(rawY)) continue;

    /*
      PDF's origin is the bottom-left corner and a template is written by
      reading the printed sheet from the top. Flipping here means every anchor
      in a device template is the number a person measures off the page, rather
      than that number subtracted from the page height.
    */
    items.push({ text, x: Math.round(x), y: Math.round(viewport.height - rawY) });
  }

  // Reading order: down the page, then across each line. A 4pt band counts as
  // the same line, which is enough to keep a row of figures together without
  // merging two rows of a dense table.
  items.sort((a, b) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x));

  return {
    width: Math.round(viewport.width),
    height: Math.round(viewport.height),
    items,
    plainText: items.map((item) => item.text).join('\n'),
  };
}
