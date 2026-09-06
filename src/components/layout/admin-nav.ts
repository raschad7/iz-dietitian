import { type NavLabelKey, type NavSection } from '@/components/layout/sidebar';
import { type IconName } from '@/components/ui/icon';

/**
 * The platform owner's navigation.
 *
 * ```text
 * نظرة عامة
 * الذكاء الاصطناعي
 *
 * إدارة                ← a heading, not a control
 *   العيادات
 *   الحسابات
 *   الكتالوج المشترك
 * ```
 *
 * Same grammar as `STAFF_NAV`, and for the same reasons: sections are printed
 * headings rather than things you press, so the column has one shape on every
 * screen, and `flatten()` walks straight through them when the rail folds to
 * its icon strip on a phone.
 *
 * **The top band is deliberately the two screens that answer "is anything
 * wrong, and what is it costing me".** Those are the questions a platform owner
 * opens this area to ask; the three lists under إدارة are where they go to act
 * on the answer. The band has no heading for the same reason the staff rail's
 * does not — it is where you land, not somewhere you navigate to.
 *
 * There is no rail row for a *clinic's* screens. This area never renders a
 * dietitian's dashboard, and it holds no session that could: see
 * `requireAdminSession`, which grants no `clinicId` at all.
 */
export const ADMIN_NAV = [
  {
    id: 'overview',
    children: [
      { href: '/admin', labelKey: 'adminOverview' },
      /*
        The reason this area was built. It sits in the top band rather than
        under إدارة because AI spend is a number you check, not a register you
        work in — the same standing this rail gives the overview.

        The label names the subject rather than the measurement — الذكاء
        الاصطناعي, not استهلاك الذكاء الاصطناعي, which overflowed the rail and
        was drawn with its last word replaced by an ellipsis. The screen's own
        heading is where "usage" is said.
      */
      { href: '/admin/ai', labelKey: 'adminAi' },
      /*
        What the platform earns. Beside AI spend rather than under إدارة for the
        same reason: it is a figure you check, not a register you work in — and
        the two together are the whole of "is this business healthy", which is
        the question the top band answers.
      */
      { href: '/admin/revenue', labelKey: 'adminRevenue' },
    ],
  },
  {
    id: 'platform',
    /*
      `nav.management` — the same word the staff rail puts over its own band of
      registers, already written in both languages. A second key meaning the
      same thing is a second thing to keep translated, and "المنصة" was already
      spoken for by the rail's own title.
    */
    labelKey: 'management',
    children: [
      { href: '/admin/clinics', labelKey: 'adminClinics' },
      { href: '/admin/accounts', labelKey: 'adminAccounts' },
      /*
        The shared catalog — `catalog_foods` and the `clinic_id IS NULL` dishes.
        A clinic's own private foods are edited by that clinic in `/app/dishes`
        and are not this screen's business.
      */
      { href: '/admin/catalog', labelKey: 'adminCatalog' },
      /*
        The record of what was done here. Under إدارة rather than in the top
        band because it is read after the fact — the register you go to when a
        question has already been asked, not one of the two figures you check on
        the way in.
      */
      { href: '/admin/audit', labelKey: 'adminAudit' },
    ],
  },
] as const satisfies readonly NavSection[];

/**
 * One glyph per destination, section headings excluded — see the note on
 * `STAFF_NAV_ICONS` for why a heading carries none.
 *
 * `satisfies` ties these to the label keys, so a typo is a compile error rather
 * than a row that quietly sits misaligned.
 */
export const ADMIN_NAV_ICONS = {
  adminOverview: 'dashboard',
  adminAi: 'ai',
  adminRevenue: 'bills',
  adminClinics: 'clinicOutline',
  adminAccounts: 'person',
  adminCatalog: 'foods',
  adminAudit: 'history',
} as const satisfies Partial<Record<NavLabelKey, IconName>>;
