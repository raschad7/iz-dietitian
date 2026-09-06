import { describe, expect, test } from 'bun:test';

import { ADMIN_NAV, ADMIN_NAV_ICONS } from './admin-nav';
import { STAFF_NAV } from './staff-nav';

/**
 * The platform rail, checked against the two properties that are easy to break
 * from a distance: that it never offers a clinic's screens, and that every row
 * it does offer has a glyph to fold down to.
 */

function hrefsOf(sections: typeof ADMIN_NAV | typeof STAFF_NAV): string[] {
  const out: string[] = [];

  const walk = (nodes: readonly unknown[]) => {
    for (const node of nodes) {
      const item = node as { href?: string; children?: readonly unknown[] };
      if (item.href) out.push(item.href);
      if (item.children) walk(item.children);
    }
  };

  walk(sections.map((section) => ({ children: section.children })));
  return out;
}

describe('ADMIN_NAV', () => {
  test('every destination is under /admin', () => {
    for (const href of hrefsOf(ADMIN_NAV)) {
      expect(href.startsWith('/admin')).toBe(true);
    }
  });

  /**
   * The tenant boundary as a navigation property. An admin session holds no
   * `clinicId`, so a `/app` row here would be a link that lands on
   * `requireStaffClinic` and throws — and a `/portal` row would be worse.
   */
  test('offers nothing from the staff or portal areas', () => {
    const admin = new Set(hrefsOf(ADMIN_NAV));

    for (const href of hrefsOf(STAFF_NAV)) {
      expect(admin.has(href)).toBe(false);
    }
  });

  test('has no duplicate destinations', () => {
    const hrefs = hrefsOf(ADMIN_NAV);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  /**
   * Folded to its icon strip the rail draws glyphs and nothing else, so a
   * destination without one is a blank button on every phone.
   */
  test('every destination has an icon', () => {
    for (const section of ADMIN_NAV) {
      for (const child of section.children) {
        expect(ADMIN_NAV_ICONS).toHaveProperty(child.labelKey);
      }
    }
  });

  /** Sections are printed headings; a glyph would make one look pressable. */
  test('no section heading has an icon', () => {
    for (const section of ADMIN_NAV) {
      if (!('labelKey' in section) || !section.labelKey) continue;
      expect(ADMIN_NAV_ICONS).not.toHaveProperty(section.labelKey);
    }
  });

  /** The logo at the head of the rail finds its home link by this exact address. */
  test('carries /admin itself, which the rail mark links to', () => {
    expect(hrefsOf(ADMIN_NAV)).toContain('/admin');
  });

  /**
   * The two screens the panel gained when it stopped being a set of registers:
   * what the platform earns, and the record of what has been done to it.
   */
  test('carries revenue and the audit log', () => {
    const hrefs = hrefsOf(ADMIN_NAV);

    expect(hrefs).toContain('/admin/revenue');
    expect(hrefs).toContain('/admin/audit');
  });

  /**
   * `/admin/search` is deliberately NOT a rail row. It is the destination of the
   * search field in the layout, and a row for it would be a button that opens an
   * empty results page — the field is already on every screen.
   */
  test('does not offer the search results screen as a destination', () => {
    expect(hrefsOf(ADMIN_NAV)).not.toContain('/admin/search');
  });
});
