import { getTranslations } from 'next-intl/server';

import { Input } from '@/components/ui/input';
import type { Locale } from '@/i18n/routing';

import { QueryForm } from './query-form';

/**
 * One search box, above every platform screen.
 *
 * ## Why it is in the layout and not on a screen
 *
 * The panel this replaces had three search fields — one on the clinics screen,
 * one on accounts, one on the catalog — each scoped to its own table. An
 * operator holding an email address had to decide first which of the three
 * screens it belonged to, which is the question they opened the panel to answer.
 * Support work does not arrive pre-sorted by table.
 *
 * Putting it in the layout means it is in the same place on every screen, and
 * `/admin/search` searches all three at once.
 *
 * ## It is still a plain GET form
 *
 * No command palette, no keystroke listener. The product has a palette in the
 * staff app and it earns its keep there — dozens of destinations, used all day.
 * This area has seven screens and one reader; a modal that has to be opened
 * before it can be typed into would be slower than a field that is already on
 * the page. `QueryForm` turns the submit into a router push so searching does
 * not throw the document away and replay the launch screen; without JavaScript
 * the browser submits it the ordinary way.
 *
 * ## ⚠ The glyph comes from `Input`, not from a span beside it
 *
 * This used to draw its own absolutely-positioned icon at `start-3` and pad the
 * field with `ps-9`. That is a second implementation of something `Input`
 * already has, and it was **visibly wrong in Arabic**: for an Arabic value or
 * placeholder, `Input` paints the text in an overlay layer rather than in the
 * native control (Chromium clips Almarai's descenders inside inputs), and that
 * overlay takes the field's *own* padding — `px-5` — because it has no way to
 * know about a caller's `ps-9`. So the placeholder started at 20px, the
 * hand-rolled magnifier sat at 12–28px, and the two overlapped. Passing `icon`
 * lets the component pad both layers to the same well.
 */
export async function GlobalSearch({ locale }: { locale: Locale }) {
  const t = await getTranslations('admin.search');

  return (
    <QueryForm path="/admin/search" locale={locale} role="search" className="w-full max-w-md">
      <Input
        type="search"
        name="q"
        icon="search"
        aria-label={t('label')}
        placeholder={t('placeholder')}
      />
    </QueryForm>
  );
}
