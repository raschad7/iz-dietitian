import { describe, expect, test } from 'bun:test';

import { clinicContactLinks, clinicMapLink } from './clinic-contact';

const CODE = '970';

describe('clinicContactLinks', () => {
  test('reads a local number with a trunk zero', () => {
    expect(clinicContactLinks('0599123456', CODE)).toEqual({
      tel: 'tel:+970599123456',
      whatsapp: 'https://wa.me/970599123456',
    });
  });

  test('reads the same number written internationally, with spaces', () => {
    expect(clinicContactLinks('+970 59 912 3456', CODE)).toEqual({
      tel: 'tel:+970599123456',
      whatsapp: 'https://wa.me/970599123456',
    });
  });

  test('a clinic with no number recorded gets no links', () => {
    expect(clinicContactLinks(null, CODE)).toEqual({ tel: null, whatsapp: null });
  });

  test('a note typed into the phone field produces no links rather than a broken call', () => {
    // The screen falls back to showing the text as written. A `tel:` built from
    // this would dial whatever the OS made of it.
    expect(clinicContactLinks('ask at reception', CODE)).toEqual({ tel: null, whatsapp: null });
    expect(clinicContactLinks('123', CODE)).toEqual({ tel: null, whatsapp: null });
  });
});

describe('clinicMapLink', () => {
  test('escapes the address into a search query', () => {
    expect(clinicMapLink('شارع الإرسال، رام الله')).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('شارع الإرسال، رام الله')}`,
    );
  });

  test('is null for a missing or blank address', () => {
    expect(clinicMapLink(null)).toBeNull();
    expect(clinicMapLink('   ')).toBeNull();
  });
});
