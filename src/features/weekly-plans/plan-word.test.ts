import { describe, expect, test } from 'bun:test';

import { wordDocument } from './plan-word';

const sheet =
  '<div class="plan-print"><table class="plan-print-meals"><tr><td>فطور</td></tr></table></div>';

function build(overrides: Partial<Parameters<typeof wordDocument>[0]> = {}) {
  return wordDocument({
    body: sheet,
    title: 'Clinic - Sara - 2026-08-30',
    dir: 'rtl',
    lang: 'ar',
    ...overrides,
  });
}

describe('wordDocument', () => {
  test('declares the namespaces that make Word open it as a document', () => {
    const html = build();

    // Without these Word treats the file as a web page and opens a browser.
    expect(html).toContain('xmlns:o="urn:schemas-microsoft-com:office:office"');
    expect(html).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(html).toContain('<w:WordDocument>');
  });

  test('sets the page up as portrait A4 — this is prose, not a timetable', () => {
    const html = build();

    expect(html).toContain('size: 21cm 29.7cm');
    expect(html).not.toContain('landscape');
    // The section class is what binds the @page rule to the content.
    expect(html).toContain('<div class="WordSection1">');
    expect(html).toContain('div.WordSection1 { page: WordSection1; }');
  });

  test('embeds the rendered sheet verbatim rather than rebuilding it', () => {
    expect(build()).toContain(sheet);
  });

  test('carries the direction onto both html and body, so Arabic opens right to left', () => {
    const rtl = build();

    expect(rtl).toContain('lang="ar" dir="rtl"');
    expect(rtl).toContain('<body dir="rtl" lang="ar">');

    const ltr = build({ dir: 'ltr', lang: 'en' });

    expect(ltr).toContain('<body dir="ltr" lang="en">');
  });

  test('styles the sheet by the same class names React already rendered', () => {
    const html = build();

    // The port only works if it targets what React rendered — see `plan-word.ts`.
    for (const selector of [
      'table.plan-print-meals',
      '.plan-print-day-head',
      '.plan-print-meal-slot',
      '.plan-print-dish',
      '.plan-print-portions',
      '.plan-print-amount',
      '.plan-print-alts',
    ]) {
      expect(html).toContain(selector);
    }
  });

  test('ships no logical properties, which Word silently drops', () => {
    const html = build();
    const styles = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

    for (const property of ['margin-inline', 'padding-inline', 'border-inline', 'border-block']) {
      expect(styles).not.toContain(property);
    }
  });

  test('escapes the title, which is built from a client name', () => {
    const html = build({ title: 'Clinic <b>& "Sara"' });

    expect(html).toContain('<title>Clinic &lt;b&gt;&amp; &quot;Sara&quot;</title>');
  });
});
