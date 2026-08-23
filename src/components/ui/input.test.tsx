import { describe, expect, test } from 'bun:test';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';

import { Input } from './input';

function renderInput(locale: 'ar' | 'en', input: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{}}>
      {input}
    </NextIntlClientProvider>,
  );
}

describe('Input Arabic text layer', () => {
  test('mirrors an uncontrolled Arabic text value outside the native input', () => {
    const markup = renderInput(
      'ar',
      <Input defaultValue="وجبة يومية" placeholder="اسم الوجبة" />,
    );

    expect(markup).toContain('data-unclipped-shell="value"');
    expect(markup).toContain('-webkit-text-fill-color:transparent');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('>وجبة يومية</span>');
  });

  test('leaves the English input as the outer element', () => {
    const markup = renderInput('en', <Input defaultValue="Daily meal" />);

    expect(markup.startsWith('<input')).toBe(true);
    expect(markup).not.toContain('data-unclipped-shell');
    expect(markup).not.toContain('-webkit-text-fill-color:transparent');
  });

  test('keeps Latin text and its native caret together in an Arabic page', () => {
    const markup = renderInput(
      'ar',
      <Input value="rad" onChange={() => undefined} placeholder="اسم الطبق" />,
    );

    expect(markup).toContain('data-unclipped-shell="value"');
    expect(markup).not.toContain('aria-hidden="true"');
    expect(markup).not.toContain('-webkit-text-fill-color:transparent');
    expect(markup).toContain('value="rad"');
  });

  test('reserves the shared leading-icon well for an Arabic placeholder', () => {
    const markup = renderInput(
      'ar',
      <Input type="search" icon="search" placeholder="ابحث بالاسم" />,
    );

    expect(markup).toContain('absolute inset-y-0 start-0 flex w-12');
    expect(markup).toContain('whitespace-nowrap ps-12 pe-5');
    expect(markup).toContain('>ابحث بالاسم</span>');
  });

  test('mirrors an Arabic password placeholder without mirroring its value', () => {
    const emptyMarkup = renderInput('ar', <Input type="password" placeholder="كلمة المرور" />);
    const filledMarkup = renderInput(
      'ar',
      <Input type="password" defaultValue="سرّي" placeholder="كلمة المرور" />,
    );

    expect(emptyMarkup).toContain('data-unclipped-shell="placeholder"');
    expect(emptyMarkup).toContain('>كلمة المرور</span>');
    expect(filledMarkup).not.toContain('aria-hidden="true"');
    expect(filledMarkup).not.toContain('-webkit-text-fill-color:transparent');
    expect(filledMarkup.match(/سرّي/g)?.length).toBe(1);
  });

  test('supports an explicit opt-out for a composite control', () => {
    const markup = renderInput('ar', <Input unclippedText={false} defaultValue="وجبة" />);

    expect(markup.startsWith('<input')).toBe(true);
    expect(markup).not.toContain('data-unclipped-shell');
  });
});
